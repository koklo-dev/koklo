import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installAiBench } from "./helpers/ai-bench.ts";
import { commentsFor } from "./helpers/comments.ts";
import { insertActor } from "./helpers/organizations.ts";
import { insertAudit, insertAuditBulk, keyed, overviewApi } from "./helpers/overview.ts";
import { entity, readScene, seedIndex } from "./helpers/spec-read.ts";
import { createWorld, seedTicket, type World } from "./helpers/tickets.ts";

/**
 * TK-92 lot A : l'activité de `project.overview` (aperçu de 5 entrées) et de `project.activity` (liste à
 * curseur). Liste fermée d'événements d'`audit_log`, phrases construites par le serveur, le client ne lit
 * que trois familles, jamais un événement technique.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });

interface Item {
  actor: { kind: string; name: string; initials: string };
  text: string;
  at: string;
}
const world = async (): Promise<World> => keyed(bench().app, await createWorld(bench().database));
const overview = async (w: World, role: keyof World["actors"] = "owner") => {
  const res = await overviewApi(bench().app, w.actors[role]).overview(w.projectId);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.activity as { items: Item[]; total: number };
};
const audit = (w: World, seed: Parameters<typeof insertAudit>[2]) =>
  insertAudit(bench().database, w.organizationId, { projectId: w.projectId, ...seed });
const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("aperçu de l'activité : projection lisible", () => {
  it("phrases complètes, trois types d'acteurs, 5 entrées et total réel", async () => {
    const w = await world();
    const scene = await readScene(bench(), { world: w });
    await seedIndex(bench(), scene, [{ id: "F-001", titre: "Réserver un créneau" }], {
      commit: true,
    });
    const reviewId = randomUUID();
    await bench().database.query(
      `INSERT INTO reviews (id, organization_id, project_id, repo_id, target_kind, target_ref, sha, status,
                            author_user_id, author_role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'feature', 'F-001', $5, 'approved', $6, 'client', now(), now())`,
      [
        reviewId,
        w.organizationId,
        w.projectId,
        scene.repoId,
        "a".repeat(40),
        w.actors.client.userId,
      ],
    );
    await audit(w, {
      action: "review.approve",
      targetKind: "review",
      targetId: reviewId,
      actorId: w.actors.client.userId,
      occurredAt: at(1),
    });
    await audit(w, { action: "idea.freeze", actorId: w.actors.owner.userId, occurredAt: at(2) });
    await audit(w, { action: "idea.proposal.accept", actorKind: "agent", occurredAt: at(3) });
    for (let n = 4; n <= 8; n++) {
      await audit(w, {
        action: "spec.batch.submit",
        actorId: w.actors.dev.userId,
        occurredAt: at(n),
      });
    }
    const { items, total } = await overview(w);
    expect(total).toBe(8);
    expect(items).toHaveLength(5);
    expect(items[0]).toMatchObject({
      actor: { kind: "client", name: w.actors.client.name },
      text: `${w.actors.client.name} a validé F-001 Réserver un créneau`,
    });
    expect(items[1]).toMatchObject({
      actor: { kind: "team" },
      text: `${w.actors.owner.name} a publié une version du dossier d'idée`,
    });
    expect(items[2]).toMatchObject({
      actor: { kind: "agent", name: "L'agent", initials: "IA" },
      text: "L'agent a accepté une proposition de l'agent",
    });
    for (const item of items) expect(item.text).toMatch(/ a [a-zé]/);
  });

  it("le client ne lit que review.*, suggestion.create et idea.freeze ; jamais un événement technique", async () => {
    const w = await world();
    const owner = w.actors.owner.userId;
    for (const action of [
      "spec.batch.submit",
      "sprint.activate",
      "project_client.add",
      "idea.proposal.accept",
      "ticket.update",
      "lease.acquire",
    ]) {
      await audit(w, { action, actorId: owner });
    }
    await audit(w, { action: "idea.freeze", actorId: owner });
    const team = await overview(w, "owner");
    const client = await overview(w, "client");
    expect(team.total).toBe(5);
    expect(client.total).toBe(1);
    expect(client.items).toHaveLength(1);
    expect(client.items[0]?.text).toContain("dossier d'idée");
    expect((await overview(w, "business")).total).toBe(1);
  });

  it("ni les événements du système, ni ceux d'un autre projet, ni la liste non fermée", async () => {
    const w = await world();
    const other = await insertAuditFor(w, { action: "idea.freeze" });
    await audit(w, { action: "idea.freeze", actorKind: "system" });
    await audit(w, { action: "ticket.create", actorId: w.actors.owner.userId });
    expect(await overview(w)).toEqual({ items: [], total: 0 });
    expect(other).toBeTruthy();
  });

  it("project.create est lu même sans projet porté par la ligne (écriture d'organisation)", async () => {
    const w = await world();
    await insertAudit(bench().database, w.organizationId, {
      action: "project.create",
      actorId: w.actors.owner.userId,
      targetKind: "project",
      targetId: w.projectId,
      projectId: null,
    });
    const { items } = await overview(w);
    expect(items.map((item) => item.text)).toEqual([`${w.actors.owner.name} a créé le projet`]);
  });

  it("commentaire de table (B454) : l'équipe lit « a commenté la table T-… », jamais le client, jamais un commentaire de ticket", async () => {
    const w = await world();
    const scene = await readScene(bench(), { world: w });
    await seedIndex(bench(), scene, [], {
      entities: [entity("table", "T-clients", "a", { nom: "Clients" })],
    });
    const ticket = await seedTicket(bench().app, w.actors.dev, w.projectId);
    await commentsFor(bench().app, w.actors.dev, w.projectId).create(ticket.id, "Un ticket");
    const posted = await commentsFor(bench().app, w.actors.designer, w.projectId).createOnTable(
      "T-clients",
      "Une remarque",
    );
    expect(posted.status, JSON.stringify(posted.body)).toBe(200);

    const team = await overview(w);
    expect(team.items.map((item) => item.text)).toEqual([
      expect.stringMatching(/a commenté la table T-clients$/),
    ]);
    expect((await overview(w, "client")).items).toEqual([]);
  });

  it("un acteur supprimé ne casse pas la phrase", async () => {
    const w = await world();
    await audit(w, { action: "idea.freeze", actorId: randomUUID() });
    const { items } = await overview(w);
    expect(items[0]?.text).toBe("Un ancien membre a publié une version du dossier d'idée");
    expect(items[0]?.actor).toMatchObject({ kind: "team", initials: "?" });
  });

  it("aucune donnée de journal brute au client : ni identifiant, ni e-mail, ni nom d'action", async () => {
    const w = await world();
    await audit(w, { action: "idea.freeze", actorId: w.actors.owner.userId });
    const text = JSON.stringify(await overview(w, "client"));
    expect(text).not.toContain("idea.freeze");
    expect(text).not.toContain(w.actors.owner.email);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("1 000 événements : l'aperçu reste borné à 5 et rapide (aucun N+1)", async () => {
    const w = await world();
    await insertAuditBulk(bench().database, w, 1000, w.actors.owner.userId);
    const started = Date.now();
    const { items, total } = await overview(w);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(items).toHaveLength(5);
    expect(total).toBe(1000);
  });
});

async function insertAuditFor(w: World, seed: Parameters<typeof insertAudit>[2]) {
  const other = await insertProjectOf(w);
  return insertAudit(bench().database, w.organizationId, { ...seed, projectId: other });
}
async function insertProjectOf(w: World): Promise<string> {
  const id = randomUUID();
  await bench().database.query(
    "INSERT INTO projects (id, organization_id, name, created_at, updated_at) VALUES ($1, $2, 'Autre', now(), now())",
    [id, w.organizationId],
  );
  return id;
}

describe("project.activity : liste à curseur, 50 par page", () => {
  const page = (w: World, query = "", role: keyof World["actors"] = "owner") =>
    overviewApi(bench().app, w.actors[role]).activity(w.projectId, query);

  it("deux pages de 50 par curseur, du plus récent au plus ancien, sans doublon", async () => {
    const w = await world();
    await insertAuditBulk(bench().database, w, 60, w.actors.owner.userId);
    const first = await page(w);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.items).toHaveLength(50);
    expect(first.body).toMatchObject({ total: 60, offset: 0, previousCursor: null });
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await page(w, `?cursor=${first.body.nextCursor}`);
    expect(second.body.items).toHaveLength(10);
    expect(second.body).toMatchObject({ total: 60, nextCursor: null });
    const ats = [...first.body.items, ...second.body.items].map((item: Item) => item.at);
    expect(new Set(ats).size).toBe(60);
    expect([...ats].sort().reverse()).toEqual(ats);
  });

  it("la limite est bornée par le contrat ; un curseur mal formé est refusé (VALIDATION)", async () => {
    const w = await world();
    await insertAuditBulk(bench().database, w, 7, w.actors.owner.userId);
    expect((await page(w, "?limit=3")).body.items).toHaveLength(3);
    expect((await page(w, "?limit=101")).status).toBe(400);
    const bad = await page(w, "?cursor=n-importe-quoi");
    expect([bad.status, bad.body.code]).toEqual([422, "VALIDATION"]);
  });

  it("mêmes filtres que l'aperçu : le client ne reçoit que ses trois familles", async () => {
    const w = await world();
    await audit(w, { action: "spec.batch.submit", actorId: w.actors.dev.userId });
    await audit(w, { action: "idea.freeze", actorId: w.actors.owner.userId });
    expect((await page(w)).body.total).toBe(2);
    const client = await page(w, "", "client");
    expect(client.body.total).toBe(1);
    expect(client.body.items).toHaveLength(1);
  });

  it("404 uniforme et 401 comme l'aperçu", async () => {
    const w = await world();
    const stranger = await createWorld(bench().database);
    const res = await overviewApi(bench().app, stranger.actors.owner).activity(w.projectId);
    expect(res.status).toBe(404);
    const loner = await insertActor(bench().database, w.organizationId, "client", "loner-activity");
    expect((await overviewApi(bench().app, loner).activity(w.projectId)).status).toBe(404);
    expect((await overviewApi(bench().app, undefined).activity(w.projectId)).status).toBe(401);
  });
});
