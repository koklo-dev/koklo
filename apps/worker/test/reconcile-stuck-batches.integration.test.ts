import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  failJob,
  jobsOf,
  keyIsBlocked,
  liveJob,
  orphanBatch,
  resetBench,
  runReconcile,
  SPEC_WRITE_QUEUE,
} from "./support/reconcile-bench.ts";
import { BOT } from "./support/spec-write-bench.ts";
import { WebhookBench, type WebhookScene } from "./support/webhook-bench.ts";

/**
 * TK-46a passe P2 : lots `spec-write` `queued`/`committing` plus vieux que la grâce sans job vivant
 * (job `failed` après `retryLimit` expirations, clé `repoId:branche` bloquée). AC-8
 * `reconcile-stuck-write-batch-requeued` : relancé et terminé, sans double commit. Chaque
 * changement d'état écrit une ligne `audit_log` système `spec_write_batch.requeued` (cible = lot).
 */
let bench: WebhookBench;

beforeAll(async () => {
  bench = await WebhookBench.create();
  await bench.start();
}, 240_000);
afterAll(async () => {
  await bench?.dispose();
});
beforeEach(async () => {
  await resetBench(bench);
});

const jobs = (batchId: string) => jobsOf(bench, SPEC_WRITE_QUEUE, "batchId", batchId);
const batch = (id: string) => bench.inner.batch(id);
const settled = (id: string) => bench.inner.settled(id, 40_000);
const audits = (organizationId: string) =>
  bench.query<{
    action: string;
    actor_kind: string;
    actor_id: string | null;
    target_kind: string;
    target_id: string;
  }>(
    "SELECT action, actor_kind, actor_id, target_kind, target_id FROM audit_log WHERE organization_id = $1 ORDER BY occurred_at, id",
    [organizationId],
  );

async function commitAsBot(scene: WebhookScene, batchId: string) {
  const auth = await bench.spy.auth(scene.owner);
  return bench.spy.inner.writeCommit({
    auth,
    repo: scene.ref,
    branch: "cadrage",
    author: BOT,
    message: `spec: créé F-001\n\nKoklo-Ops: ${batchId}\n`,
    files: [{ path: "features/F-001-orpheline.md", content: "posé avant le crash\n" }],
  });
}

describe("reconcile-stuck-write-batch-requeued", () => {
  it("un lot queued de 20 min sans job est ré-enfilé (nouvel id, clé repoId:branche) puis committed", async () => {
    const scene = await bench.scene();
    const stuck = await orphanBatch(bench, scene);

    const summary = await runReconcile(bench);

    expect((await settled(stuck.id)).status).toBe("committed");
    expect(await bench.inner.files(scene)).toContain("features/F-001-orpheline.md");
    const [job, ...others] = await jobs(stuck.id);
    expect(others).toEqual([]);
    expect(job?.id).not.toBe(stuck.id);
    expect(job?.singleton_key).toBe(stuck.singletonKey);
    expect(summary.batches?.requeued).toBe(1);
  });
});

describe("reconcile-stuck-write-batch-requeued : reprise", () => {
  it("un lot committing dont le commit existe déjà est repris par le trailer : committed, sans second commit", async () => {
    const scene = await bench.scene();
    const stuck = await orphanBatch(bench, scene, { status: "committing" });
    const posted = await commitAsBot(scene, stuck.id);
    const commits = (await bench.inner.commits(scene)).length;
    bench.spy.reset();

    await runReconcile(bench);

    const row = await settled(stuck.id);
    expect(row.status).toBe("committed");
    expect(row.commit_sha).toBe(posted.sha);
    expect(bench.spy.callsOf("writeCommit")).toEqual([]);
    expect((await bench.inner.commits(scene)).length).toBe(commits);
  });

  it("un lot dont le job est failed (clé bloquée) : job supprimé, nouveau job, lot terminé, clé libérée", async () => {
    const scene = await bench.scene();
    const stuck = await orphanBatch(bench, scene, { status: "committing" });
    await liveJob(bench, SPEC_WRITE_QUEUE, { batchId: stuck.id }, stuck.singletonKey, stuck.id);
    await failJob(bench, SPEC_WRITE_QUEUE, stuck.id);
    expect(
      await keyIsBlocked(bench, SPEC_WRITE_QUEUE, { batchId: stuck.id }, stuck.singletonKey),
    ).toBe(true);

    await runReconcile(bench);

    expect((await settled(stuck.id)).status).toBe("committed");
    const rows = await jobs(stuck.id);
    expect(rows.some((job) => job.state === "failed")).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).not.toBe(stuck.id);
    const next = await orphanBatch(bench, scene, { ageMinutes: 0, title: "Suivante" });
    await bench.query(
      "UPDATE spec_write_operations SET target_spec_id = 'F-002' WHERE batch_id = $1",
      [next.id],
    );
    await bench.worker.boss.send(
      SPEC_WRITE_QUEUE,
      { batchId: next.id },
      { id: next.id, singletonKey: next.singletonKey },
    );
    expect((await settled(next.id)).status).toBe("committed");
  });
});

describe("reconcile-stuck-write-batch-requeued : lots à laisser", () => {
  it("un lot plus récent que la grâce, ou avec un job vivant, n'est pas ré-enfilé", async () => {
    const scene = await bench.scene();
    const fresh = await orphanBatch(bench, scene, { ageMinutes: 5 });
    const other = await bench.scene();
    const alive = await orphanBatch(bench, other);
    await liveJob(bench, SPEC_WRITE_QUEUE, { batchId: alive.id }, alive.singletonKey, alive.id);

    const summary = await runReconcile(bench);

    expect(await jobs(fresh.id)).toEqual([]);
    expect((await jobs(alive.id)).map((job) => job.id)).toEqual([alive.id]);
    expect((await batch(fresh.id))?.status).toBe("queued");
    expect(summary.batches?.requeued).toBe(0);
  });
});

describe("reconcile-stuck-write-batch-requeued : lots réglés", () => {
  it.each(["committed", "failed", "conflict"])(
    "un lot %s ancien est réglé : jamais ré-enfilé",
    async (status) => {
      const scene = await bench.scene();
      const old = await orphanBatch(bench, scene);
      // Fixture valide au regard des CHECK : un lot committed porte commit_sha et
      // committed_at ; un lot failed/conflict porte un error_code.
      await bench.query(
        `UPDATE spec_write_batches
            SET status = $2::write_batch_status,
                commit_sha = CASE WHEN $2 = 'committed' THEN repeat('a', 40) END,
                committed_at = CASE WHEN $2 = 'committed' THEN now() END,
                error_code = CASE WHEN $2 <> 'committed' THEN 'INTERNAL' END
          WHERE id = $1`,
        [old.id, status],
      );

      await runReconcile(bench);

      expect(await jobs(old.id)).toEqual([]);
      expect((await batch(old.id))?.status).toBe(status);
    },
  );
});

describe("audit et idempotence", () => {
  it("une ligne d'audit système par lot réparé, cible = le lot (UUID), dans SA organisation", async () => {
    const scene = await bench.scene();
    const stuck = await orphanBatch(bench, scene);

    await runReconcile(bench);
    await settled(stuck.id);

    expect(await audits(scene.organizationId)).toEqual([
      {
        action: "spec_write_batch.requeued",
        actor_kind: "system",
        actor_id: null,
        target_kind: "spec_write_batch",
        target_id: stuck.id,
      },
    ]);
  });

  it("un second run n'enfile rien et n'ajoute aucune ligne d'audit", async () => {
    const scene = await bench.scene();
    const stuck = await orphanBatch(bench, scene);
    await runReconcile(bench);
    await settled(stuck.id);
    const jobsBefore = await jobs(stuck.id);

    const second = await runReconcile(bench);

    expect(second.batches?.requeued).toBe(0);
    expect(await jobs(stuck.id)).toEqual(jobsBefore);
    expect(await audits(scene.organizationId)).toHaveLength(1);
  });

  it("multi-tenant : deux organisations, un audit chacune, jamais celui de l'autre", async () => {
    const [a, b] = [await bench.scene(), await bench.scene()];
    const [stuckA, stuckB] = [await orphanBatch(bench, a), await orphanBatch(bench, b)];

    await runReconcile(bench);
    await settled(stuckA.id);
    await settled(stuckB.id);

    expect((await audits(a.organizationId)).map((row) => row.target_id)).toEqual([stuckA.id]);
    expect((await audits(b.organizationId)).map((row) => row.target_id)).toEqual([stuckB.id]);
    expect((await jobs(stuckA.id))[0]?.singleton_key).toBe(`${a.repoId}:cadrage`);
    expect((await jobs(stuckB.id))[0]?.singleton_key).toBe(`${b.repoId}:cadrage`);
  });
});
