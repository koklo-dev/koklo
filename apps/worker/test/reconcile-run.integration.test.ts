import * as domain from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  jobsOf,
  orphanBatch,
  orphanDelivery,
  RECONCILE_QUEUE,
  resetBench,
  runReconcile,
  SPEC_WRITE_QUEUE,
  summaryIn,
} from "./support/reconcile-bench.ts";
import { WebhookBench } from "./support/webhook-bench.ts";

/**
 * TK-46a socle du job `reconcile` : planification unique `*\/10 * * * *` UTC (AC-13), verrou
 * consultatif anti-chevauchement (AC-12), passes isolées (la panne d'une passe n'arrête pas l'autre),
 * aucun secret ni charge dans les journaux et l'audit (AC-14, partie P1/P2).
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

describe("reconcile-schedule-registered-once", () => {
  it("planifiée toutes les 10 minutes en UTC, une seule fois même après un redémarrage", async () => {
    await bench.start();
    await bench.start();

    const schedules = (await bench.worker.boss.getSchedules()).filter(
      (schedule) => schedule.name === RECONCILE_QUEUE,
    );

    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({ cron: "*/10 * * * *", timezone: "UTC" });
  });
});

describe("reconcile-no-overlap", () => {
  async function withLockHeld<T>(body: () => Promise<T>): Promise<T> {
    const key = (domain as unknown as Record<string, unknown>).RECONCILE_LOCK_KEY;
    expect(typeof key).toBe("number");
    const client = await bench.inner.db.connect();
    try {
      await client.query("SELECT pg_advisory_lock($1::bigint)", [key]);
      return await body();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [key]);
      client.release();
    }
  }

  it("verrou pris par un autre tick : le run se termine en `already_running`, sans rien réparer", async () => {
    const scene = await bench.scene();
    const orphan = await orphanDelivery(bench, scene);
    const stuck = await orphanBatch(bench, scene);

    const summary = await withLockHeld(() => runReconcile(bench));

    expect(summary).toMatchObject({ skipped: "already_running" });
    expect(await jobsOf(bench, "webhook-delivery", "deliveryId", orphan.id)).toEqual([]);
    expect(await jobsOf(bench, SPEC_WRITE_QUEUE, "batchId", stuck.id)).toEqual([]);
  });

  it("verrou libéré : le tick suivant répare, puis libère à son tour le verrou", async () => {
    const scene = await bench.scene();
    const orphan = await orphanDelivery(bench, scene);
    await withLockHeld(() => runReconcile(bench));

    const summary = await runReconcile(bench);
    const again = await runReconcile(bench);

    expect(summary.deliveries?.requeued).toBe(1);
    expect(await jobsOf(bench, "webhook-delivery", "deliveryId", orphan.id)).toHaveLength(1);
    expect(again.skipped).toBeUndefined();
  });
});

describe("passes isolées", () => {
  async function breaking(table: string, body: () => Promise<void>): Promise<void> {
    await bench.query(`ALTER TABLE ${table} RENAME TO ${table}_off`);
    try {
      await body();
    } finally {
      await bench.query(`ALTER TABLE ${table}_off RENAME TO ${table}`);
    }
  }

  it("P1 en panne : le job termine normalement, P2 répare quand même et la panne est nommée", async () => {
    const scene = await bench.scene();
    const stuck = await orphanBatch(bench, scene);

    let summary: Awaited<ReturnType<typeof runReconcile>> | undefined;
    await breaking("webhook_deliveries", async () => {
      summary = await runReconcile(bench);
    });

    expect(summary?.failedPasses).toEqual(["deliveries"]);
    expect(summary?.batches?.requeued).toBe(1);
    expect(await jobsOf(bench, SPEC_WRITE_QUEUE, "batchId", stuck.id)).toHaveLength(1);
  });

  it("P2 en panne : le job termine normalement, P1 répare quand même et la panne est nommée", async () => {
    const scene = await bench.scene();
    const orphan = await orphanDelivery(bench, scene);

    let summary: Awaited<ReturnType<typeof runReconcile>> | undefined;
    await breaking("spec_write_batches", async () => {
      summary = await runReconcile(bench);
    });

    expect(summary?.failedPasses).toEqual(["batches"]);
    expect(summary?.deliveries?.requeued).toBe(1);
    expect(await jobsOf(bench, "webhook-delivery", "deliveryId", orphan.id)).toHaveLength(1);
  });

  it("sans panne, failedPasses est vide", async () => {
    const summary = await runReconcile(bench);
    expect(summary.failedPasses).toEqual([]);
  });
});

describe("reconcile-no-secret-leak", () => {
  it("ni la charge d'une livraison ni le message d'un lot n'apparaissent dans les journaux ou l'audit", async () => {
    const scene = await bench.scene();
    const orphan = await orphanDelivery(bench, scene, { canary: "payload-canary-4617" });
    const stuck = await orphanBatch(bench, scene, { message: "message-canary-9911" });

    const summary = await runReconcile(bench);

    expect(summary.deliveries?.requeued).toBe(1);
    expect(summary.batches?.requeued).toBe(1);
    await bench.settled(orphan.id);
    await bench.inner.settled(stuck.id, 40_000);
    const audit = await bench.query<{ row: string }>(
      "SELECT row_to_json(a)::text AS row FROM audit_log a",
    );
    const everything = [...bench.lines, ...audit.map((row) => row.row)].join("\n");
    expect(everything).not.toContain("payload-canary-4617");
    expect(everything).not.toContain("message-canary-9911");
  });

  it("le bilan ne contient que des nombres et des noms de passes (pas d'identifiants de lignes)", async () => {
    const scene = await bench.scene();
    const orphan = await orphanDelivery(bench, scene);
    const stuck = await orphanBatch(bench, scene);

    await runReconcile(bench);

    const line = JSON.stringify(summaryIn(bench.lines));
    expect(line).not.toContain(orphan.id);
    expect(line).not.toContain(stuck.id);
  });
});
