import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ideaApi, pageIdOf, seedIdeaTemplate } from "./helpers/idea.ts";
import {
  auditCount,
  BRANCH,
  batchApi,
  batchRows,
  installSpecBench,
  jobCount,
  operationRows,
  specScene,
} from "./helpers/spec-batch.ts";

/**
 * TK-89 lot A (T13) : `idea.publish` crée, sans rien écrire chez le fournisseur, un lot sur la branche
 * `cadrage` avec les opérations `idea.page.write`, `idea.page.delete` et `idea.index.write` ; le
 * payload est un instantané du contenu, jamais d'e-mail ; le worker du lot B l'exécute.
 */
const bench = installSpecBench({ beforeAll, afterAll, beforeEach });

async function scene() {
  const b = bench();
  await b.stopWorker();
  const s = await specScene(b);
  await seedIdeaTemplate(b.database, {
    organizationId: s.world.organizationId,
    projectId: s.projectId,
  });
  return { b, s, owner: ideaApi(b.app, s.world.actors.owner) };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("idea.publish : le lot", () => {
  it("crée un lot en file sur cadrage, une opération par page active plus l'index, sans appel git", async () => {
    const { b, s, owner } = await scene();
    const id = await pageIdOf(b.database, s.projectId, "vision");
    await owner.save(s.projectId, id, 1, "## Vision\n\nContenu publié.");
    const key = `k-${randomUUID()}`;
    const res = await owner.publish(s.projectId, key);
    expect(res.status).toBe(200);
    expect(res.body.batchId).toMatch(/^[0-9a-f-]{36}$/);

    const [row] = await batchRows(b.database, s.projectId);
    expect(row).toMatchObject({
      id: res.body.batchId,
      branch: BRANCH,
      status: "queued",
      idempotency_key: key,
    });
    expect(row?.author_user_id).toBe(s.world.actors.owner.userId);
    const ops = await operationRows(b.database, res.body.batchId);
    expect(ops.map((o) => o.kind)).toEqual([
      ...Array(10).fill("idea.page.write"),
      "idea.index.write",
    ]);
    expect(ops.every((o) => o.target_spec_id === null)).toBe(true);
    expect(await jobCount(b.database)).toBe(1);
    expect(b.harness.calls).toEqual([]);
    expect(await auditCount(b.database, s.world.organizationId, "spec.batch.submit")).toBe(1);
  });

  it("le payload d'une page porte slug, titre, statut, requise, origine, mise à jour, contributeurs et contenu", async () => {
    const { b, s, owner } = await scene();
    const id = await pageIdOf(b.database, s.projectId, "vision");
    await owner.save(s.projectId, id, 1, "## Vision\n\nContenu publié.");
    const res = await owner.publish(s.projectId, `k-${randomUUID()}`);
    const ops = await operationRows(b.database, res.body.batchId);
    const vision = ops.find((o) => o.payload.slug === "vision");
    expect(vision?.payload).toMatchObject({
      slug: "vision",
      title: "Vision",
      status: "draft",
      required: true,
      origin: "template",
      contentMd: "## Vision\n\nContenu publié.",
      contributeurs: [s.world.actors.owner.name],
    });
    expect(typeof vision?.payload.mis_a_jour).toBe("string");
  });

  it("l'index porte la structure, l'ordre et les contributeurs par identifiant, jamais d'e-mail", async () => {
    const { b, s, owner } = await scene();
    const id = await pageIdOf(b.database, s.projectId, "perimetre");
    await ideaApi(b.app, s.world.actors.designer).save(s.projectId, id, 1, "Périmètre");
    const res = await owner.publish(s.projectId, `k-${randomUUID()}`);
    const ops = await operationRows(b.database, res.body.batchId);
    const index = ops.find((o) => o.kind === "idea.index.write");
    const pages = index?.payload.pages as { slug: string; position: number }[];
    expect(pages.map((p) => p.slug)).toEqual([
      "vision",
      "probleme",
      "utilisateurs",
      "proposition-valeur",
      "parcours",
      "perimetre",
      "contraintes",
      "mesure",
      "hypotheses-risques",
      "glossaire",
    ]);
    expect(pages.map((p) => p.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(index?.payload.contributorUserIds).toEqual([s.world.actors.designer.userId]);
    const all = JSON.stringify(ops.map((o) => o.payload));
    for (const actor of Object.values(s.world.actors)) expect(all).not.toContain(actor.email);
  });

  it("une page supprimée n'est pas publiée ; si elle l'a déjà été, une opération la supprime", async () => {
    const { b, s, owner } = await scene();
    const mesure = await pageIdOf(b.database, s.projectId, "mesure");
    await owner.remove(s.projectId, mesure);
    const first = await owner.publish(s.projectId, `k-${randomUUID()}`);
    const firstOps = await operationRows(b.database, first.body.batchId);
    expect(firstOps.filter((o) => o.kind === "idea.page.write")).toHaveLength(9);
    expect(firstOps.some((o) => o.kind === "idea.page.delete")).toBe(false);
    await b.database.query(
      `INSERT INTO idea_publications (id, organization_id, project_id, commit_sha, published_at, pages_versions, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, now(), '{"mesure":1,"vision":1}'::jsonb, now())`,
      [s.world.organizationId, s.projectId, "c".repeat(40)],
    );
    const second = await owner.publish(s.projectId, `k-${randomUUID()}`);
    const secondOps = await operationRows(b.database, second.body.batchId);
    const removal = secondOps.find((o) => o.kind === "idea.page.delete");
    expect(removal?.payload).toEqual({ slug: "mesure" });
  });

  it("même clé et même contenu : le même lot ; même clé et autre contenu : SPEC_BATCH_CONFLICT", async () => {
    const { b, s, owner } = await scene();
    const key = `k-${randomUUID()}`;
    const first = await owner.publish(s.projectId, key);
    const replay = await owner.publish(s.projectId, key);
    expect(replay.status).toBe(200);
    expect(replay.body.batchId).toBe(first.body.batchId);
    expect(await batchRows(b.database, s.projectId)).toHaveLength(1);
    await owner.save(s.projectId, await pageIdOf(b.database, s.projectId, "vision"), 1, "changé");
    const reused = await owner.publish(s.projectId, key);
    expect(reused.status).toBe(409);
    expect(reused.body.code).toBe("SPEC_BATCH_CONFLICT");
  });

  it("le lot se suit avec specBatch.get", async () => {
    const { b, s, owner } = await scene();
    const res = await owner.publish(s.projectId, `k-${randomUUID()}`);
    const got = await batchApi(b.app, s.world.actors.owner).get(s.projectId, res.body.batchId);
    expect(got.status).toBe(200);
    expect(got.body.id).toBe(res.body.batchId);
  });

  it.each(["owner", "admin", "dev", "designer"] as const)("%s publie", async (role) => {
    const { b, s } = await scene();
    const res = await ideaApi(b.app, s.world.actors[role]).publish(
      s.projectId,
      `k-${randomUUID()}`,
    );
    expect(res.status).toBe(200);
  });

  it("client lié et business : 403, aucun lot", async () => {
    const { b, s } = await scene();
    for (const role of ["client", "business"] as const) {
      const res = await ideaApi(b.app, s.world.actors[role]).publish(
        s.projectId,
        `k-${randomUUID()}`,
      );
      expect(res.status).toBe(403);
    }
    expect(await batchRows(b.database, s.projectId)).toHaveLength(0);
  });

  it("sans dépôt de spec : NOT_FOUND ; la liste annonce publication.available = false", async () => {
    const b = bench();
    await b.stopWorker();
    const { createWorld } = await import("./helpers/tickets.ts");
    const world = await createWorld(b.database);
    await seedIdeaTemplate(b.database, {
      organizationId: world.organizationId,
      projectId: world.projectId,
    });
    const owner = ideaApi(b.app, world.actors.owner);
    expect((await owner.publish(world.projectId, `k-${randomUUID()}`)).status).toBe(404);
    expect((await owner.list(world.projectId)).body.publication.available).toBe(false);
  });
});

describe("idea.list : dernière publication", () => {
  it("un lot committé devient une publication, une seule fois", async () => {
    const { b, s, owner } = await scene();
    expect((await owner.list(s.projectId)).body.publication).toEqual({
      available: true,
      last: null,
    });
    const published = await owner.publish(s.projectId, `k-${randomUUID()}`);
    const sha = "d".repeat(40);
    await b.database.query(
      "UPDATE spec_write_batches SET status = 'committed', commit_sha = $2, committed_at = now() WHERE id = $1",
      [published.body.batchId, sha],
    );
    const first = await owner.list(s.projectId);
    expect(first.body.publication.last.commitSha).toBe(sha);
    await owner.list(s.projectId);
    const rows = await b.database.query(
      "SELECT pages_versions FROM idea_publications WHERE project_id = $1",
      [s.projectId],
    );
    expect(rows).toHaveLength(1);
    expect(Object.keys((rows[0] as { pages_versions: object }).pages_versions)).toHaveLength(10);
  });
});
