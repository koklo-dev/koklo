import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PURGE_QUEUE, WAIT_MS, WebhookBench } from "./support/webhook-bench.ts";

/**
 * TK-45b §7.1 : tâche planifiée `webhook-purge` (pg-boss `schedule`, quotidienne à 03:17 UTC) qui
 * supprime, par lots bornés, les livraisons reçues il y a plus de `WEBHOOK_RETENTION_DAYS` jours
 * (défaut 30), tous statuts confondus, jamais les plus récentes. Idempotente.
 */
let bench: WebhookBench;
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

beforeAll(async () => {
  bench = await WebhookBench.create();
  await bench.start();
}, 240_000);
afterAll(async () => {
  await bench?.dispose();
});

async function purge(): Promise<void> {
  const id = await bench.worker.boss.send(PURGE_QUEUE, {});
  await vi.waitFor(
    async () => {
      const job = await bench.worker.boss.getJobById(PURGE_QUEUE, id ?? "");
      if (job?.state !== "completed") throw new Error(`purge : ${job?.state}`);
    },
    { timeout: WAIT_MS, interval: 150 },
  );
}

const existing = async (ids: string[]) =>
  (
    await bench.query<{ id: string }>(
      "SELECT id FROM webhook_deliveries WHERE id = ANY($1::uuid[])",
      [ids],
    )
  )
    .map((row) => row.id)
    .sort();

describe("rétention de 30 jours par défaut", () => {
  it("supprime les livraisons de plus de 30 jours, garde les autres, tous statuts confondus", async () => {
    const keep = [
      await bench.insertDelivery({ receivedAt: ago(29), status: "processed" }),
      await bench.insertDelivery({ receivedAt: ago(0), status: "received" }),
      await bench.insertDelivery({ receivedAt: new Date(Date.now() + DAY), status: "processing" }),
    ];
    const drop = [
      await bench.insertDelivery({ receivedAt: ago(31), status: "processed" }),
      await bench.insertDelivery({ receivedAt: ago(31), status: "received" }),
      await bench.insertDelivery({ receivedAt: ago(45), status: "failed" }),
      await bench.insertDelivery({ receivedAt: ago(400), status: "ignored" }),
    ];

    await purge();

    expect(await existing([...keep, ...drop])).toEqual([...keep].sort());
  });

  it("par lots bornés : plus de 2 000 lignes expirées sont toutes supprimées par un seul passage", async () => {
    await bench.query(
      `INSERT INTO webhook_deliveries (id, provider, delivery_id, event, payload, status, received_at, created_at, updated_at)
       SELECT gen_random_uuid(), 'github', 'bulk-' || n, 'push', '{}'::jsonb, 'processed', now() - interval '40 days', now(), now()
       FROM generate_series(1, 2500) AS n`,
    );
    const recent = await bench.insertDelivery({ receivedAt: ago(1) });

    await purge();

    const [old] = await bench.query<{ n: string }>(
      "SELECT count(*) AS n FROM webhook_deliveries WHERE delivery_id LIKE 'bulk-%'",
    );
    expect(old?.n).toBe("0");
    expect(await existing([recent])).toEqual([recent]);
  });

  it("idempotente : un second passage ne supprime rien et termine normalement", async () => {
    const keep = await bench.insertDelivery({ receivedAt: ago(5) });
    await purge();
    await purge();
    expect(await existing([keep])).toEqual([keep]);
  });

  it("ne journalise pas les charges supprimées", async () => {
    await bench.insertDelivery({ receivedAt: ago(50), payload: { canary: "payload-canary-7788" } });
    await purge();
    expect(bench.lines.join("\n")).not.toContain("payload-canary-7788");
  });
});

describe("rétention configurable et planification", () => {
  it("WEBHOOK_RETENTION_DAYS (webhookRetentionDays) = 7 : 8 jours supprimé, 6 jours conservé", async () => {
    await bench.start({ webhookRetentionDays: 7 });
    const keep = await bench.insertDelivery({ receivedAt: ago(6) });
    const drop = await bench.insertDelivery({ receivedAt: ago(8) });

    await purge();

    expect(await existing([keep, drop])).toEqual([keep]);
  });

  it("la tâche est planifiée une fois par jour à 03:17 UTC, y compris après un redémarrage", async () => {
    await bench.start();
    await bench.start();

    const schedules = (await bench.worker.boss.getSchedules()).filter(
      (schedule) => schedule.name === PURGE_QUEUE,
    );

    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({ cron: "17 3 * * *", timezone: "UTC" });
  });
});
