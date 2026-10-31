import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openTransactions } from "./helpers/repos.ts";
import {
  auditCount,
  BRANCH,
  batch,
  batchApi,
  batchRows,
  commitsOf,
  createOp,
  installSpecBench,
  specScene,
} from "./helpers/spec-batch.ts";

/**
 * TK-44b §4.3 : `submit` attend le résultat au plus SPEC_BATCH_WAIT_MS (sondage de la base, aucune
 * transaction ouverte pendant l'attente) puis rend le lot en cours ; `specBatch.get` donne la suite.
 */
const WAIT_MS = 1500;
const bench = installSpecBench({ beforeAll, afterAll, beforeEach }, { waitMs: WAIT_MS });

const QUEUED_BODY = batch([createOp("En attente")], { branch: BRANCH, idempotencyKey: "attente" });

/** Worker arrêté : le lot reste en file et `submit` rend le lot en cours à l'expiration de l'attente. */
async function submitWhileStopped() {
  const b = bench();
  const s = await specScene(b);
  await b.stopWorker();
  const started = Date.now();
  const res = await batchApi(b.app, s.world.actors.dev).submit(s.projectId, QUEUED_BODY);
  return { b, s, res, elapsed: Date.now() - started };
}

describe("attente bornée du résultat", () => {
  it("sans worker : après SPEC_BATCH_WAIT_MS, le lot en cours est rendu (200, queued), avec ses F-nnn", async () => {
    const { b, s, res, elapsed } = await submitWhileStopped();

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(WAIT_MS - 200);
    expect(elapsed).toBeLessThan(WAIT_MS + 6000);
    expect(res.body).toMatchObject({
      status: "queued",
      branch: BRANCH,
      commitSha: null,
      errorCode: null,
      report: null,
      committedAt: null,
      results: [
        { position: 0, kind: "feature.create", specId: expect.stringMatching(/^F-\d{3,}$/) },
      ],
    });
    expect(res.body).not.toHaveProperty("authorUserId");
    const got = await batchApi(b.app, s.world.actors.dev).get(s.projectId, res.body.id);
    expect(got.status).toBe(200);
    expect(got.body.status).toBe("queued");
    expect(got.body.results).toEqual(res.body.results);
  });
});

describe("attente bornée du résultat : reprise du worker", () => {
  it("le worker revient : le lot est commité (specBatch.get), le rejeu rend le même lot, un seul commit", async () => {
    const { b, s, res } = await submitWhileStopped();
    const api = batchApi(b.app, s.world.actors.dev);

    await b.startWorker();
    await vi.waitFor(
      async () => {
        const again = await api.get(s.projectId, res.body.id);
        expect(again.body.status).toBe("committed");
        expect(again.body.commitSha).toMatch(/^[0-9a-f]{40}$/);
        expect(again.body.committedAt).toEqual(expect.any(String));
        expect(again.body.results).toEqual(res.body.results);
      },
      { timeout: 30_000, interval: 250 },
    );
    const replay = await api.submit(s.projectId, QUEUED_BODY);

    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(res.body.id);
    expect(replay.body.status).toBe("committed");
    const bodyOps = (await commitsOf(b, s)).filter((c) =>
      c.message.includes(`Koklo-Ops: ${res.body.id}`),
    );
    expect(bodyOps).toHaveLength(1);
    expect(await auditCount(b.database, s.world.organizationId, "spec.batch.submit")).toBe(1);
  });
});

describe("attente bornée du résultat (suite 2)", () => {
  it("l'attente sonde la base : un lot passé committed en cours d'attente est rendu aussitôt", async () => {
    const b = bench();
    const s = await specScene(b);
    await b.stopWorker();
    const started = Date.now();
    // Un objet supertest est paresseux : la requête ne part qu'au `then`, d'où `Promise.resolve`.
    const pending = Promise.resolve(
      batchApi(b.app, s.world.actors.dev).submit(
        s.projectId,
        batch([createOp("Sondée")], { branch: BRANCH }),
      ),
    );

    await vi.waitFor(async () => expect(await batchRows(b.database, s.projectId)).toHaveLength(1), {
      timeout: 5000,
      interval: 50,
    });
    // Aucune transaction n'est ouverte pendant l'attente.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await openTransactions(b.database)).toBe(0);
    const sha = "a".repeat(40);
    await b.database.query(
      "UPDATE spec_write_batches SET status = 'committed', commit_sha = $1, committed_at = now() WHERE project_id = $2",
      [sha, s.projectId],
    );
    const res = await pending;

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ status: "committed", commitSha: sha });
    expect(Date.now() - started).toBeLessThan(WAIT_MS);
  });
});

describe("attente bornée du résultat (suite 3)", () => {
  it("l'attente rend l'erreur typée d'un lot qui échoue en cours d'attente", async () => {
    const b = bench();
    const s = await specScene(b);
    await b.stopWorker();
    // Un objet supertest est paresseux : la requête ne part qu'au `then`, d'où `Promise.resolve`.
    const pending = Promise.resolve(
      batchApi(b.app, s.world.actors.dev).submit(
        s.projectId,
        batch([createOp("Échouée")], { branch: BRANCH }),
      ),
    );
    await vi.waitFor(async () => expect(await batchRows(b.database, s.projectId)).toHaveLength(1), {
      timeout: 5000,
      interval: 50,
    });

    await b.database.query(
      "UPDATE spec_write_batches SET status = 'conflict', error_code = 'write_conflict' WHERE project_id = $1",
      [s.projectId],
    );
    const res = await pending;

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SPEC_BATCH_CONFLICT");
    expect(res.body.data.reason).toBe("write_conflict");
    expect(res.body.data.batchId).toEqual(expect.any(String));
  });
});
