import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { type ClientScene, createClientScene } from "./helpers/client-scene.ts";
import { insertAudit } from "./helpers/overview.ts";
import { insertProject, send } from "./helpers/tickets.ts";

/**
 * TK-93 lot A (cas 1 à 3) : `project.cards` sur base réelle. Phase, avancement, prochaine étape,
 * personnes et activité par carte ; tri, recherche, filtres, facettes, total et curseur calculés
 * côté serveur sur tous les projets visibles ; un client ne voit que ses projets.
 */
let database: TestDatabase;
let app: INestApplication;
let scene: ClientScene;
const extra: string[] = [];

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  scene = await createClientScene(database);
  for (let n = 1; n <= 30; n += 1) {
    extra.push(
      await insertProject(
        database,
        scene.organizationId,
        `Atelier ${String(n).padStart(2, "0")}`,
        `2026-02-${String((n % 27) + 1).padStart(2, "0")}T00:00:00Z`,
      ),
    );
  }
  await stabilisePages(scene.projects.p2);
}, 180_000);
afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const cards = (cookie: string, query = "") => send(app, cookie, "get", `/projects/cards${query}`);
const owner = () => scene.staff.owner.cookie;
const dev = () => scene.staff.dev.cookie;
const idsOf = (body: { items: { id: string }[] }) => body.items.map((item) => item.id);

async function stabilisePages(projectId: string): Promise<void> {
  for (const [position, slug] of ["vision", "probleme", "utilisateurs", "perimetre"].entries()) {
    await database.query(
      `INSERT INTO idea_pages (id, organization_id, project_id, slug, title, position, required, origin, template_key, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4, $5, true, 'template', $4, 'stable', now(), now())`,
      [randomUUID(), scene.organizationId, projectId, slug, position],
    );
  }
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même route, un test par cas
describe("TK-93 project.cards : liste de l'équipe", () => {
  it("24 cartes par page, total, facettes et audience exacts", async () => {
    const res = await cards(dev());
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items).toHaveLength(24);
    expect(res.body.total).toBe(33);
    expect(res.body.facets).toEqual({ all: 33, idea: 33, framing: 0, iterations: 0 });
    expect(res.body.audience).toBe("team");
    expect(res.body.nextCursor).not.toBeNull();
  });

  it("deuxième page par le curseur : sans doublon, stable si un projet naît entre-temps", async () => {
    const first = await cards(dev(), "?sort=name");
    const inserted = await insertProject(database, scene.organizationId, "Atelier 00");
    const second = await cards(dev(), `?sort=name&cursor=${first.body.nextCursor}`);
    expect(second.body.items).toHaveLength(9);
    expect(second.body.nextCursor).toBeNull();
    const seen = new Set([...idsOf(first.body), ...idsOf(second.body)]);
    expect(seen.size).toBe(33);
    expect(seen.has(inserted)).toBe(false);
    await database.query("DELETE FROM projects WHERE id = $1", [inserted]);
  });

  it("tri par nom, par activité (dernier événement d'abord) et par attention", async () => {
    await insertAudit(database, scene.organizationId, {
      action: "idea.freeze",
      actorId: scene.staff.admin.userId,
      projectId: scene.projects.old,
      occurredAt: "2026-11-08T10:00:00Z",
    });
    const byActivity = await cards(dev(), "?sort=activity");
    expect(byActivity.body.items[0].id).toBe(scene.projects.old);
    expect(byActivity.body.items[0].lastActivity).toMatchObject({
      actor: scene.staff.admin.name,
      at: "2026-11-08T10:00:00.000Z",
    });
    const byName = await cards(dev(), "?sort=name");
    expect(byName.body.items[0].name).toBe("Atelier 01");
    const byAttention = await cards(dev(), "?sort=attention");
    expect(byAttention.body.items.at(0).nextAction.attention).toBe(true);
    const rest = await cards(dev(), `?sort=attention&cursor=${byAttention.body.nextCursor}`);
    expect(rest.body.items.at(-1).id).toBe(scene.projects.p2);
  });

  it("recherche et filtre de phase sur des éléments hors page ; les facettes suivent la recherche", async () => {
    const res = await cards(dev(), "?q=atelier%2030");
    expect(res.body.items.map((item: { name: string }) => item.name)).toEqual(["Atelier 30"]);
    expect(res.body.total).toBe(1);
    expect(res.body.facets).toEqual({ all: 1, idea: 1, framing: 0, iterations: 0 });
    const none = await cards(dev(), "?phase=iterations");
    expect(none.body).toMatchObject({ items: [], total: 0, nextCursor: null });
    expect(none.body.facets.all).toBe(33);
  });

  it("attention : tous les projets sauf celui dont le dossier est calme", async () => {
    const res = await cards(dev());
    expect(res.body.attention).toBe(32);
    const calm = (await cards(dev(), "?q=client%202")).body.items[0];
    expect(calm.nextAction.attention).toBe(false);
  });

  it("contenu d'une carte : tuile, avancement d'idée, client lié et personnes", async () => {
    const p1 = (await cards(dev(), "?q=client%201")).body.items[0];
    expect(p1).toMatchObject({
      id: scene.projects.p1,
      initials: "PC",
      phase: "idea",
      clientContact: scene.c1.name,
      creation: null,
      progress: { label: "Dossier d'idée", done: 0, total: 0 },
    });
    expect(p1.colorKey).toBeGreaterThanOrEqual(1);
    expect(p1.people[0]).toMatchObject({ client: true, name: scene.c1.name });
    const p2 = (await cards(dev(), "?q=client%202")).body.items[0];
    expect(p2.progress).toMatchObject({ done: 4, total: 4, valueLabel: "4 pages stables sur 4" });
  });

  it("le propriétaire voit la règle « IA non configurée » en tête de chaque carte", async () => {
    const res = await cards(owner(), "?q=client%202");
    expect(res.body.items[0].nextAction).toMatchObject({
      title: "L'IA n'est pas configurée pour l'organisation",
      attention: true,
    });
  });

  it("refuse un curseur illisible et une limite hors bornes", async () => {
    expect((await cards(dev(), "?cursor=nimportequoi")).status).toBe(422);
    expect((await cards(dev(), "?limit=25")).status).toBeGreaterThanOrEqual(400);
  });

  it("sans session : 401", async () => {
    expect((await send(app, undefined, "get", "/projects/cards")).status).toBe(401);
  });
});

describe("TK-93 project.cards : cartes de création", () => {
  it("une création en cours est portée par la carte ; canAct réservé à owner et admin", async () => {
    const projectId = await insertProject(database, scene.organizationId, "Atelier neuf");
    await database.query(
      `INSERT INTO project_creations (id, organization_id, project_id, status, repo_name, idea_template, requested_by, created_at, updated_at)
       VALUES ($1, $2, $3, 'running', 'atelier-neuf-spec', 'default', $4, now(), now())`,
      [randomUUID(), scene.organizationId, projectId, scene.staff.owner.userId],
    );
    const asOwner = (await cards(owner(), "?q=atelier%20neuf")).body.items[0];
    expect(asOwner.creation).toMatchObject({ status: "running", canAct: true });
    expect(asOwner.creation.steps.map((s: { key: string }) => s.key)).toEqual([
      "project",
      "idea",
      "repo",
    ]);
    const asDev = (await cards(dev(), "?q=atelier%20neuf")).body.items[0];
    expect(asDev.creation.canAct).toBe(false);
    await database.query(
      "UPDATE project_creations SET status = 'succeeded' WHERE project_id = $1",
      [projectId],
    );
    expect((await cards(dev(), "?q=atelier%20neuf")).body.items[0].creation).toBeNull();
  });

  it("un échec porte son code, jamais un message du fournisseur", async () => {
    const projectId = await insertProject(database, scene.organizationId, "Atelier raté");
    await database.query(
      `INSERT INTO project_creations (id, organization_id, project_id, status, error_code, retry_after_ms, repo_name, idea_template, requested_by, created_at, updated_at)
       VALUES ($1, $2, $3, 'failed', 'rate_limited', 4000, 'atelier-rate-spec', 'default', $4, now(), now())`,
      [randomUUID(), scene.organizationId, projectId, scene.staff.owner.userId],
    );
    const card = (await cards(dev(), "?q=atelier%20rat")).body.items[0];
    expect(card.creation).toMatchObject({
      status: "failed",
      error: { code: "rate_limited", retryAfterMs: 4000, repoName: "atelier-rate-spec" },
    });
    expect(card.creation.steps.find((s: { key: string }) => s.key === "repo").status).toBe("error");
  });
});

describe("TK-93 project.cards : vue du client", () => {
  it("ses projets seulement, libellés tournés vers lui, audience client", async () => {
    const res = await cards(scene.c1.cookie);
    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toEqual([scene.projects.p1]);
    expect(res.body).toMatchObject({ total: 1, audience: "client", attention: 0 });
    expect(res.body.facets.all).toBe(1);
    expect(res.body.items[0].clientContact).toBeNull();
    expect(res.body.items[0].nextAction.title).toBe("Rien n'attend votre action.");
  });

  it("jamais le nom ni l'identifiant d'un projet non lié, même par la recherche", async () => {
    const res = await cards(scene.c1.cookie, "?q=client");
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(scene.projects.p2);
    expect(text).not.toContain("Projet client 2");
    expect(JSON.stringify(res.body)).not.toContain(scene.foreign.projectId);
  });

  it("un client sans lien : liste vide, jamais d'erreur", async () => {
    const res = await cards(scene.c3.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: [], total: 0, nextCursor: null, audience: "client" });
  });

  it("aucune action de création pour le client (canAct faux)", async () => {
    await database.query(
      `INSERT INTO project_creations (id, organization_id, project_id, status, error_code, repo_name, idea_template, requested_by, created_at, updated_at)
       VALUES ($1, $2, $3, 'failed', 'name_taken', 'x-spec', 'default', $4, now(), now())`,
      [randomUUID(), scene.organizationId, scene.projects.p2, scene.staff.owner.userId],
    );
    const res = await cards(scene.c2.cookie);
    expect(res.body.items[0].creation.canAct).toBe(false);
  });

  it("l'organisation étrangère ne fuit pas", async () => {
    const res = await cards(scene.foreign.owner.cookie);
    expect(idsOf(res.body)).toEqual([scene.foreign.projectId]);
    expect(res.body.total).toBe(1);
  });
});
