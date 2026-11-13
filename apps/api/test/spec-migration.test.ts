import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertActor } from "./helpers/organizations.ts";
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
import { send } from "./helpers/tickets.ts";

/**
 * TK-106 lot B (cas 11) : `specMigration.start` et `.revert`. Owner seul (403 pour tout autre rôle, y compris un
 * rôle d'agent inconnu), projet hors périmètre en 404, clé d'idempotence rejouée = même lot, audit écrit, aucun
 * appel git à l'enfilage (le worker exécute).
 */
const bench = installSpecBench({ beforeAll, afterAll, beforeEach });

const path = (projectId: string, suffix = "") => `/projects/${projectId}/spec/migration${suffix}`;
const start = (cookie: string | undefined, projectId: string, body: Record<string, unknown> = {}) =>
  send(bench().app, cookie, "post", path(projectId), {
    projectId,
    idempotencyKey: `k-${randomUUID()}`,
    ...body,
  });
const revert = (cookie: string | undefined, projectId: string, body: Record<string, unknown>) =>
  send(bench().app, cookie, "post", path(projectId, "/revert"), {
    projectId,
    idempotencyKey: `k-${randomUUID()}`,
    ...body,
  });

async function queuedScene() {
  const b = bench();
  await b.stopWorker();
  return { b, s: await specScene(b) };
}

describe("specMigration.start : droits", () => {
  it("l'owner enfile un lot spec.migrate sur cadrage : aucune opération ciblée, un job, un audit, aucun appel git", async () => {
    const { b, s } = await queuedScene();
    const key = `k-${randomUUID()}`;
    const res = await start(s.world.actors.owner.cookie, s.projectId, { idempotencyKey: key });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.batchId).toMatch(/^[0-9a-f-]{36}$/);
    const [row] = await batchRows(b.database, s.projectId);
    expect(row).toMatchObject({
      id: res.body.batchId,
      branch: BRANCH,
      status: "queued",
      idempotency_key: key,
      author_role: "owner",
    });
    const ops = await operationRows(b.database, res.body.batchId);
    expect(ops.map((o) => [o.kind, o.target_spec_id])).toEqual([["spec.migrate", null]]);
    expect(await jobCount(b.database)).toBe(1);
    expect(b.harness.calls).toEqual([]);
    expect(await auditCount(b.database, s.world.organizationId, "spec.batch.submit")).toBe(1);
  });

  it.each(["admin", "dev", "designer", "business", "client"] as const)(
    "%s : 403 FORBIDDEN, aucun lot, aucun audit, aucun appel git",
    async (role) => {
      const { b, s } = await queuedScene();
      const res = await start(s.world.actors[role].cookie, s.projectId);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
      expect(await batchRows(b.database, s.projectId)).toEqual([]);
      expect(await auditCount(b.database, s.world.organizationId, "spec.batch.submit")).toBe(0);
      expect(b.harness.calls).toEqual([]);
    },
  );

  it.each(["agent", "runner"])("une session de rôle %s : 403 FORBIDDEN", async (role) => {
    const { b, s } = await queuedScene();
    const actor = await insertActor(b.database, s.world.organizationId, role as never, role);
    const res = await start(actor.cookie, s.projectId);
    expect(res.status).toBe(403);
    expect(await batchRows(b.database, s.projectId)).toEqual([]);
  });

  it("sans session : 401", async () => {
    const { s } = await queuedScene();
    expect((await start(undefined, s.projectId)).status).toBe(401);
  });

  it("un projet hors périmètre : 404 uniforme, même pour l'owner", async () => {
    const { s } = await queuedScene();
    const res = await start(s.world.actors.owner.cookie, randomUUID());
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});

describe("specMigration.start : lot", () => {
  it("la clé d'idempotence rejouée rend le même lot, sans second lot ni second audit", async () => {
    const { b, s } = await queuedScene();
    const key = `k-${randomUUID()}`;
    const first = await start(s.world.actors.owner.cookie, s.projectId, { idempotencyKey: key });
    const again = await start(s.world.actors.owner.cookie, s.projectId, { idempotencyKey: key });
    expect(again.status).toBe(200);
    expect(again.body.batchId).toBe(first.body.batchId);
    expect(await batchRows(b.database, s.projectId)).toHaveLength(1);
    expect(await auditCount(b.database, s.world.organizationId, "spec.batch.submit")).toBe(1);
  });

  it("la clé réutilisée avec un autre contenu : 409 SPEC_BATCH_CONFLICT", async () => {
    const { s } = await queuedScene();
    const key = `k-${randomUUID()}`;
    await start(s.world.actors.owner.cookie, s.projectId, { idempotencyKey: key });
    const res = await start(s.world.actors.owner.cookie, s.projectId, {
      idempotencyKey: key,
      branch: "autre",
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SPEC_BATCH_CONFLICT");
  });

  it("jamais la branche par défaut : 422 VALIDATION", async () => {
    const { b, s } = await queuedScene();
    const res = await start(s.world.actors.owner.cookie, s.projectId, { branch: "main" });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(await batchRows(b.database, s.projectId)).toEqual([]);
  });
});

describe("specMigration.revert", () => {
  it("un lot qui n'est pas une migration commitée du projet : 422 VALIDATION, aucun lot de plus", async () => {
    const { b, s } = await queuedScene();
    const queued = await start(s.world.actors.owner.cookie, s.projectId);
    const res = await revert(s.world.actors.owner.cookie, s.projectId, {
      migrationBatchId: queued.body.batchId,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(await batchRows(b.database, s.projectId)).toHaveLength(1);
  });

  it("un lot inconnu : 404", async () => {
    const { s } = await queuedScene();
    const res = await revert(s.world.actors.owner.cookie, s.projectId, {
      migrationBatchId: randomUUID(),
    });
    expect(res.status).toBe(404);
  });

  it.each(["admin", "dev", "designer", "business", "client"] as const)(
    "%s : 403 FORBIDDEN",
    async (role) => {
      const { b, s } = await queuedScene();
      const res = await revert(s.world.actors[role].cookie, s.projectId, {
        migrationBatchId: randomUUID(),
      });
      expect(res.status).toBe(403);
      expect(await batchRows(b.database, s.projectId)).toEqual([]);
    },
  );

  it("une migration commitée est annulable : lot spec.migrate.revert sur la même branche, visé par migrationBatchId", async () => {
    const { b, s } = await queuedScene();
    const migrated = await start(s.world.actors.owner.cookie, s.projectId);
    await b.database.query(
      "UPDATE spec_write_batches SET status = 'committed', commit_sha = $2, committed_at = now() WHERE id = $1",
      [migrated.body.batchId, "a".repeat(40)],
    );
    const res = await revert(s.world.actors.owner.cookie, s.projectId, {
      migrationBatchId: migrated.body.batchId,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const ops = await operationRows(b.database, res.body.batchId);
    expect(ops.map((o) => [o.kind, o.target_spec_id, o.payload])).toEqual([
      ["spec.migrate.revert", null, { migrationBatchId: migrated.body.batchId }],
    ]);
    expect(await auditCount(b.database, s.world.organizationId, "spec.batch.submit")).toBe(2);
  });
});

describe("specMigration : exécution par le worker", () => {
  it("un dépôt déjà v2 : lot failed SPEC_INVALID, rapport lisible par specBatch.get, aucun commit", async () => {
    const b = bench();
    const s = await specScene(b);
    const res = await start(s.world.actors.owner.cookie, s.projectId);
    expect(res.status).toBe(200);
    const got = await waitSettled(s, res.body.batchId);
    expect(got.status).toBe("failed");
    expect(got.errorCode).toBe("SPEC_INVALID");
    expect(got.report.issues[0].message).toContain("déjà au format v2");
  });
});

async function waitSettled(s: Awaited<ReturnType<typeof specScene>>, batchId: string) {
  const owner = batchApi(bench().app, s.world.actors.owner);
  for (let attempt = 0; attempt < 100; attempt++) {
    const res = await owner.get(s.projectId, batchId);
    if (res.body.status !== "queued" && res.body.status !== "committing") return res.body;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("lot non terminé");
}
