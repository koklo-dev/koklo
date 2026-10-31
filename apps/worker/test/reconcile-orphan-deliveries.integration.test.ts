import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DELIVERY_QUEUE,
  failJob,
  jobsOf,
  keyIsBlocked,
  liveJob,
  orphanDelivery,
  resetBench,
  runReconcile,
} from "./support/reconcile-bench.ts";
import { WebhookBench } from "./support/webhook-bench.ts";

/**
 * TK-46a passe P1 : livraisons `received`/`processing` plus vieilles que la grâce (15 min) sans job
 * vivant. AC-6 `reconcile-orphan-delivery-requeued`, AC-7 `reconcile-unblocks-failed-key`,
 * idempotence, multi-tenant. Un « job vivant » est un job en created|retry|active dont la charge
 * porte `deliveryId`.
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

const jobs = (deliveryId: string) => jobsOf(bench, DELIVERY_QUEUE, "deliveryId", deliveryId);

describe("reconcile-orphan-delivery-requeued", () => {
  it.each(["received", "processing"])(
    "une ligne %s de 20 min sans job est ré-enfilée avec un NOUVEL id et la même clé, puis traitée",
    async (status) => {
      const scene = await bench.scene();
      await bench.commit(scene, { "features/F-001-a.md": "# a\n" });
      const orphan = await orphanDelivery(bench, scene, { status });

      const summary = await runReconcile(bench);

      const row = await bench.settled(orphan.id);
      expect(row.status).toBe("processed");
      const [job, ...others] = await jobs(orphan.id);
      expect(others).toEqual([]);
      expect(job?.id).toBeDefined();
      expect(job?.id).not.toBe(orphan.id);
      expect(job?.singleton_key).toBe(orphan.singletonKey);
      expect(summary.deliveries?.requeued).toBe(1);
      expect(await bench.headSha(scene)).toBe(await bench.head(scene));
    },
  );
});

describe("reconcile-orphan-delivery-requeued : lignes à laisser", () => {
  it("une ligne plus récente que la grâce n'est pas ré-enfilée", async () => {
    const scene = await bench.scene();
    const fresh = await orphanDelivery(bench, scene, { ageMinutes: 5 });

    const summary = await runReconcile(bench);

    expect(await jobs(fresh.id)).toEqual([]);
    expect((await bench.delivery(fresh.id)).status).toBe("received");
    expect(summary.deliveries?.requeued).toBe(0);
  });

  it("une ligne ancienne avec un job vivant (created, démarrage différé) n'est pas doublée", async () => {
    const scene = await bench.scene();
    const old = await orphanDelivery(bench, scene);
    await liveJob(bench, DELIVERY_QUEUE, { deliveryId: old.id }, old.singletonKey, old.id);

    const summary = await runReconcile(bench);

    const rows = await jobs(old.id);
    expect(rows.map((job) => job.id)).toEqual([old.id]);
    expect(rows[0]?.state).toBe("created");
    expect(summary.deliveries?.requeued).toBe(0);
  });
});

describe("reconcile-orphan-delivery-requeued : bornes", () => {
  it.each(["processed", "ignored", "failed"])(
    "une ligne %s ancienne est réglée : jamais ré-enfilée",
    async (status) => {
      const scene = await bench.scene();
      const settled = await orphanDelivery(bench, scene, { status });

      await runReconcile(bench);

      expect(await jobs(settled.id)).toEqual([]);
      expect((await bench.delivery(settled.id)).status).toBe(status);
    },
  );

  it("une ligne plus vieille que la rétention moins un jour (29 j) est laissée à la purge", async () => {
    const scene = await bench.scene();
    const expired = await orphanDelivery(bench, scene, { ageMinutes: 30 * 24 * 60 });

    await runReconcile(bench);

    expect(await jobs(expired.id)).toEqual([]);
  });

  it("la grâce suit reconcileGraceMinutes : 6 min ré-enfilée, 4 min non, avec une grâce de 5", async () => {
    await bench.start({ reconcileGraceMinutes: 5 });
    try {
      const scene = await bench.scene();
      const older = await orphanDelivery(bench, scene, { ageMinutes: 6, branch: "cadrage" });
      const younger = await orphanDelivery(bench, scene, { ageMinutes: 4, branch: "main" });

      await runReconcile(bench);

      expect(await jobs(older.id)).toHaveLength(1);
      expect(await jobs(younger.id)).toEqual([]);
    } finally {
      await bench.start();
    }
  });
});

describe("idempotence", () => {
  it("un second run n'enfile rien, ne change aucune ligne et ne signale aucune réparation", async () => {
    const scene = await bench.scene();
    await bench.commit(scene, { "features/F-001-a.md": "# a\n" });
    const orphan = await orphanDelivery(bench, scene);
    await runReconcile(bench);
    const settled = await bench.settled(orphan.id);
    const before = await jobs(orphan.id);

    const second = await runReconcile(bench);

    expect(second.deliveries?.requeued).toBe(0);
    expect(await jobs(orphan.id)).toEqual(before);
    expect(await bench.delivery(orphan.id)).toEqual(settled);
  });
});

describe("reconcile-unblocks-failed-key", () => {
  async function blockedKey() {
    const scene = await bench.scene();
    await bench.commit(scene, { "features/F-001-a.md": "# a\n" });
    const orphan = await orphanDelivery(bench, scene);
    await liveJob(bench, DELIVERY_QUEUE, { deliveryId: orphan.id }, orphan.singletonKey, orphan.id);
    await failJob(bench, DELIVERY_QUEUE, orphan.id);
    return { scene, orphan };
  }

  it("précondition : un job failed bloque bien la clé key_strict_fifo", async () => {
    const { orphan } = await blockedKey();
    const blocked = await keyIsBlocked(
      bench,
      DELIVERY_QUEUE,
      { deliveryId: orphan.id },
      orphan.singletonKey,
    );
    expect(blocked).toBe(true);
    expect((await bench.delivery(orphan.id)).status).toBe("received");
  });

  it("le job failed est supprimé, un nouveau job s'exécute et la livraison est traitée", async () => {
    const { orphan } = await blockedKey();

    const summary = await runReconcile(bench);

    const row = await bench.settled(orphan.id);
    expect(row.status).toBe("processed");
    const rows = await jobs(orphan.id);
    expect(rows.some((job) => job.state === "failed")).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).not.toBe(orphan.id);
    expect(rows[0]?.singleton_key).toBe(orphan.singletonKey);
    expect(summary.deliveries?.requeued).toBe(1);
  });

  it("les livraisons suivantes de la même clé passent ensuite", async () => {
    const { scene, orphan } = await blockedKey();
    await runReconcile(bench);
    await bench.settled(orphan.id);
    await bench.commit(scene, { "features/F-002-b.md": "# b\n" });

    const next = await bench.push(scene, { branch: "cadrage", ref: "refs/heads/cadrage" });

    expect(next.status).toBe("processed");
  });
});

describe("multi-tenant", () => {
  it("deux locataires orphelins sont réparés chacun, sans croisement de clé ni de charge", async () => {
    const [a, b] = [await bench.scene(), await bench.scene()];
    await bench.commit(a, { "features/F-001-a.md": "# a\n" });
    await bench.commit(b, { "features/F-001-b.md": "# b\n" });
    const [orphanA, orphanB] = [await orphanDelivery(bench, a), await orphanDelivery(bench, b)];

    await runReconcile(bench);

    expect((await bench.settled(orphanA.id)).status).toBe("processed");
    expect((await bench.settled(orphanB.id)).status).toBe("processed");
    expect(orphanA.singletonKey).not.toBe(orphanB.singletonKey);
    expect((await jobs(orphanA.id))[0]?.singleton_key).toBe(orphanA.singletonKey);
    expect((await jobs(orphanB.id))[0]?.singleton_key).toBe(orphanB.singletonKey);
    expect(await bench.headSha(a)).toBe(await bench.head(a));
    expect(await bench.headSha(b)).toBe(await bench.head(b));
    expect(await bench.headSha(a)).not.toBe(await bench.headSha(b));
  });

  it("aucune ligne d'audit n'est écrite pour P1 (webhook_deliveries n'a pas d'organisation)", async () => {
    const scene = await bench.scene();
    await orphanDelivery(bench, scene);
    await runReconcile(bench);
    const audits = await bench.query(
      "SELECT 1 FROM audit_log WHERE action LIKE '%reconcile%' AND action NOT LIKE 'repo.reconcile.%'",
    );
    expect(audits).toEqual([]);
  });
});
