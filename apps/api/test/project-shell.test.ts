import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { stripRequestId } from "./helpers/client-scene.ts";
import { freezeIdea } from "./helpers/proposals.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { seedProposedBaseline } from "./helpers/reviews.ts";
import { DELIVERABLE_KEYS, shellApi } from "./helpers/shell.ts";
import { deliverablesApi } from "./helpers/spec-deliverables.ts";
import { readScene, seedIndex } from "./helpers/spec-read.ts";
import {
  apiFor,
  createWorld,
  insertProject,
  seedSprint,
  seedTicket,
  type World,
} from "./helpers/tickets.ts";

/**
 * TK-88 lot A (A3 à A6) : `project.shell`, GET /projects/{projectId}/shell. Phase dérivée de l'index
 * de la spec et des baselines, sept livrables ordonnés sans rien inventer (TK-100 attendu), compteur
 * de tickets du sprint actif. Accès par projet : 404 uniforme.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
const FEATURES = [{ id: "F-001" }, { id: "F-002" }];

const shellOf = (world: World, projectId = world.projectId, role: keyof World["actors"] = "dev") =>
  shellApi(bench().app, world.actors[role]).shell(projectId);

async function framingWorld() {
  const s = await readScene(bench());
  await seedIndex(bench(), s, FEATURES);
  return s;
}

describe("A3 phase dérivée", () => {
  it("idea : projet sans fonctionnalité indexée (aucun dépôt)", async () => {
    const world = await createWorld(bench().database);
    const res = await shellOf(world);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.phase).toBe("idea");
    expect(res.body.id).toBe(world.projectId);
    expect(res.body.name).toBe("Projet");
  });

  it("idea : dépôt de spec dont l'index est vide", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, []);
    expect((await shellOf(s.world)).body.phase).toBe("idea");
  });

  it("framing : fonctionnalités indexées, aucune baseline validée", async () => {
    const s = await framingWorld();
    expect((await shellOf(s.world)).body.phase).toBe("framing");
    await seedProposedBaseline(bench().database, s, "a".repeat(40));
    expect((await shellOf(s.world)).body.phase, "une baseline proposée ne change rien").toBe(
      "framing",
    );
  });

  it.each(["validated", "tagged"])("iterations : une baseline %s", async (status) => {
    const s = await framingWorld();
    const { database } = bench();
    const baseline = await seedProposedBaseline(database, s, "b".repeat(40));
    const review = randomUUID();
    await database.query(
      `INSERT INTO reviews (id, organization_id, project_id, repo_id, target_kind, target_ref, sha,
                            status, author_user_id, author_role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'baseline', 'baseline-0', $5, 'approved', $6, 'client', now(), now())`,
      [
        review,
        s.organizationId,
        s.projectId,
        s.repoId,
        "b".repeat(40),
        s.world.actors.client.userId,
      ],
    );
    const tag = status === "tagged" ? "c".repeat(40) : null;
    await database.query(
      `UPDATE baselines SET status = $2::baseline_status, review_id = $3, validated_at = now(),
                            tag_sha = $4, tagged_at = CASE WHEN $4::text IS NULL THEN NULL ELSE now() END
        WHERE id = $1`,
      [baseline, status, review, tag],
    );
    expect((await shellOf(s.world)).body.phase).toBe("iterations");
  });
});

describe("TK-91 phase : une version idea-vN fait passer l'idée au cadrage", () => {
  const insertVersion = (
    s: { organizationId: string; projectId: string },
    over: { number?: number; commitSha?: string | null } = {},
  ) =>
    bench().database.query(
      `INSERT INTO idea_versions (id, organization_id, project_id, number, tag, commit_sha, pages_versions, frozen_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb, now(), now())`,
      [
        randomUUID(),
        s.organizationId,
        s.projectId,
        over.number ?? 1,
        `idea-v${over.number ?? 1}`,
        over.commitSha === undefined ? "a".repeat(40) : over.commitSha,
      ],
    );

  it("framing : une version dont le lot est commité, sans aucune fonctionnalité", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, []);
    expect((await shellOf(s.world)).body.phase).toBe("idea");
    await insertVersion(s);
    expect((await shellOf(s.world)).body.phase).toBe("framing");
  });

  it("idea : une version dont le lot n'est pas encore commité ne change rien", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, []);
    await insertVersion(s, { commitSha: null });
    expect((await shellOf(s.world)).body.phase).toBe("idea");
  });

  it("framing : le lot commité suffit, sans passer par la liste de l'idée (réconciliation à la lecture)", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, []);
    const batchId = randomUUID();
    await bench().database.query(
      `INSERT INTO spec_write_batches (id, organization_id, project_id, repo_id, branch, idempotency_key, status, commit_sha, committed_at, updated_at)
       VALUES ($1, $2, $3, $4, 'cadrage', $5, 'committed', $6, now(), now())`,
      [batchId, s.organizationId, s.projectId, s.repoId, `k-${batchId}`, "b".repeat(40)],
    );
    await bench().database.query(
      `INSERT INTO idea_versions (id, organization_id, project_id, number, tag, batch_id, pages_versions, frozen_at, updated_at)
       VALUES ($1, $2, $3, 1, 'idea-v1', $4, '{}'::jsonb, now(), now())`,
      [randomUUID(), s.organizationId, s.projectId, batchId],
    );
    expect((await shellOf(s.world)).body.phase).toBe("framing");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("A4 sept livrables, lus dans spec.deliverables (TK-100)", () => {
  it("sans idée figée ni fonctionnalité : sept entrées dans l'ordre, aucune disponible, 0 validé", async () => {
    const world = await createWorld(bench().database);
    const { body } = await shellOf(world);
    expect(body.deliverables.map((d: { key: string }) => d.key)).toEqual([...DELIVERABLE_KEYS]);
    const available = body.deliverables.filter((d: { available: boolean }) => d.available);
    expect(available).toEqual([]);
    expect(body.validatedCount).toBe(0);
  });

  it("idea-v1 commitée : seul le Fonctionnel s'ouvre", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, []);
    await freezeIdea(bench().database, s);
    const { body } = await shellOf(s.world);
    const available = body.deliverables.filter((d: { available: boolean }) => d.available);
    expect(available.map((d: { key: string }) => d.key)).toEqual(["functional"]);
  });

  it("avec une fonctionnalité : Données et Design s'ouvrent, les quatre autres restent verrouillées", async () => {
    const s = await framingWorld();
    const { body } = await shellOf(s.world);
    const state = Object.fromEntries(
      body.deliverables.map((d: { key: string; available: boolean }) => [d.key, d.available]),
    );
    expect(state).toEqual({
      functional: true,
      data: true,
      architecture: false,
      technical: false,
      security: false,
      design: true,
      quality: false,
    });
    expect(body.validatedCount).toBe(0);
  });

  it("la disponibilité du shell est celle de spec.deliverables", async () => {
    const s = await framingWorld();
    const shell = (await shellOf(s.world)).body.deliverables;
    const list = (await deliverablesApi(bench().app, s.world.actors.dev).list(s.projectId)).body;
    expect(shell.map((d: { key: string; available: boolean }) => [d.key, d.available])).toEqual(
      list.deliverables.map((d: { key: string; available: boolean }) => [d.key, d.available]),
    );
  });

  it("chaque livrable dit après quoi il s'ouvre ; le Fonctionnel attend la première version de l'idée", async () => {
    const world = await createWorld(bench().database);
    const { body } = await shellOf(world);
    const after = Object.fromEntries(
      body.deliverables.map((d: { key: string; after: string | null }) => [d.key, d.after]),
    );
    expect(after.functional).toBe("la première version de l'idée");
    for (const key of ["architecture", "technical", "security", "quality"]) {
      expect(typeof after[key], key).toBe("string");
      expect(after[key].length, key).toBeGreaterThan(0);
    }
    expect(after.architecture).toBe("les données");
    expect(after.technical).toBe("l'architecture");
    expect(after.security).toBe("le technique");
  });

  it("la réponse ne porte que les champs du contrat (aucun contenu de spec)", async () => {
    const s = await framingWorld();
    const { body } = await shellOf(s.world);
    expect(Object.keys(body).sort()).toEqual([
      "deliverables",
      "id",
      "name",
      "phase",
      "ticketCount",
      "validatedCount",
    ]);
    expect(JSON.stringify(body)).not.toMatch(/F-00|features\/|Feature/);
  });
});

describe("A5 compteur de tickets", () => {
  it("null sans sprint actif, même avec des tickets", async () => {
    const world = await createWorld(bench().database);
    await seedTicket(bench().app, world.actors.owner, world.projectId);
    await seedSprint(bench().app, world.actors.owner, world.projectId);
    expect((await shellOf(world)).body.ticketCount).toBeNull();
  });

  it("nombre de tickets du sprint actif seulement (les autres et les supprimés ne comptent pas)", async () => {
    const world = await createWorld(bench().database);
    const owner = world.actors.owner;
    const sprint = await seedSprint(bench().app, owner, world.projectId);
    const api = apiFor(bench().app, owner, world.projectId);
    const inSprint = { sprintId: sprint.key };
    await seedTicket(bench().app, owner, world.projectId, inSprint);
    await seedTicket(bench().app, owner, world.projectId, inSprint);
    const removed = await seedTicket(bench().app, owner, world.projectId, inSprint);
    await seedTicket(bench().app, owner, world.projectId);
    await api.deleteTicket(removed.key);
    expect((await api.activateSprint(sprint.key)).status).toBe(200);
    expect((await shellOf(world)).body.ticketCount).toBe(2);
  });

  it("un sprint actif sans ticket compte 0 (et non null)", async () => {
    const world = await createWorld(bench().database);
    const sprint = await seedSprint(bench().app, world.actors.owner, world.projectId);
    await apiFor(bench().app, world.actors.owner, world.projectId).activateSprint(sprint.key);
    expect((await shellOf(world)).body.ticketCount).toBe(0);
  });
});

describe("A6 accès par projet", () => {
  it("projet inconnu, projet d'une autre organisation et client non lié : même 404", async () => {
    const world = await createWorld(bench().database, { linkedClient: false });
    const foreign = await createWorld(bench().database);
    const unknown = "99999999-9999-4999-8999-999999999999";
    const refusals = [
      await shellOf(world, unknown),
      await shellOf(world, foreign.projectId),
      await shellOf(world, world.projectId, "client"),
    ];
    for (const res of refusals) {
      expect(res.status, JSON.stringify(res.body)).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
    const [first, ...rest] = refusals.map((r) => JSON.stringify(stripRequestId(r.body)));
    for (const other of rest) expect(other).toBe(first);
  });

  it("sans session : 401", async () => {
    const world = await createWorld(bench().database);
    expect((await shellApi(bench().app, undefined).shell(world.projectId)).status).toBe(401);
  });

  it("tout rôle ayant accès reçoit 200 ; le client lié aussi, sans aucune spec", async () => {
    const world = await createWorld(bench().database);
    for (const role of ["owner", "admin", "dev", "designer", "business", "client"] as const) {
      const res = await shellOf(world, world.projectId, role);
      expect(res.status, `${role} : ${JSON.stringify(res.body)}`).toBe(200);
    }
  });

  it("un client lié à un seul de deux projets : 200 sur le sien, 404 sur l'autre", async () => {
    const world = await createWorld(bench().database);
    const other = await insertProject(bench().database, world.organizationId, "Autre");
    expect((await shellOf(world, world.projectId, "client")).status).toBe(200);
    expect((await shellOf(world, other, "client")).status).toBe(404);
    expect((await shellOf(world, other, "dev")).status).toBe(200);
  });

  it("un projet d'une autre organisation ne fuit ni son nom ni ses compteurs", async () => {
    const world = await createWorld(bench().database);
    const foreign = await createWorld(bench().database);
    const res = await shellOf(world, foreign.projectId);
    expect(JSON.stringify(res.body)).not.toContain("Projet");
  });
});
