import { randomUUID } from "node:crypto";
import {
  WEBHOOK_DELIVERY_ERROR_CODES,
  WEBHOOK_DELIVERY_QUEUE,
  webhookDeliverySingletonKey,
} from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sleep, WebhookBench, type WebhookScene } from "./support/webhook-bench.ts";

/**
 * TK-45b §4 : machine d'états de la livraison (received -> processing -> processed | ignored |
 * failed), idempotence (CA-1 : une livraison rejouée n'a aucun effet) et reprise. File
 * `webhook-delivery`, job `{ deliveryId }`, `id` du job = id de ligne.
 */
let bench: WebhookBench;
let scene: WebhookScene;

beforeAll(async () => {
  bench = await WebhookBench.create();
  await bench.start();
}, 240_000);
afterAll(async () => {
  await bench?.dispose();
});
beforeEach(async () => {
  bench.spy.reset();
  scene = await bench.scene();
});

describe("états d'une livraison traitée", () => {
  it("received -> processing (attempts + 1) -> processed, processed_at posé", async () => {
    const payload = bench.pushPayload(scene);
    const id = await bench.insertDelivery({
      installationExternalId: scene.installationExternalId,
      repoExternalId: scene.repoExternalId,
      payload: payload as unknown as Record<string, unknown>,
    });
    let during: unknown;
    bench.spy.hooks.set("listFiles", async () => {
      const [row] = await bench.query(
        "SELECT status, attempts, processed_at FROM webhook_deliveries WHERE id = $1",
        [id],
      );
      during = row;
    });
    await bench.enqueue(id, webhookDeliverySingletonKey(payload));

    const row = await bench.settled(id);

    expect(during).toMatchObject({ status: "processing", attempts: 1, processed_at: null });
    expect(row).toMatchObject({ status: "processed", attempts: 1, error_code: null });
    expect(row.processed_at).toBeInstanceOf(Date);
    expect((await bench.jobCompleted(id)).state).toBe("completed");
  });

  it("un événement sans consommateur (pull_request) finit ignored, sans appel au fournisseur", async () => {
    const id = await bench.insertDelivery({
      event: "pull_request",
      action: "opened",
      installationExternalId: scene.installationExternalId,
      repoExternalId: scene.repoExternalId,
      payload: { event: "pull_request", action: "opened" },
    });
    await bench.enqueue(id, `other:${id}`);

    const row = await bench.settled(id);

    expect(row).toMatchObject({ status: "ignored", error_code: null });
    expect(bench.spy.calls).toHaveLength(0);
    expect(await bench.snapshots(scene)).toEqual([]);
  });
});

describe("idempotence (CA-1) et reprise", () => {
  it("une livraison déjà processed n'est pas retraitée (ligne, fournisseur, index intacts)", async () => {
    const id = await bench.deliver(bench.pushPayload(scene));
    const first = await bench.settled(id);
    await bench.jobCompleted(id);
    const calls = bench.spy.calls.length;

    await bench.enqueue(id, `push:${scene.repoExternalId}:refs/heads/cadrage`, randomUUID());
    await sleep(2_500);

    expect(await bench.delivery(id)).toEqual(first);
    expect(bench.spy.calls).toHaveLength(calls);
    expect(await bench.snapshots(scene)).toHaveLength(1);
  });

  it("le même identifiant de job envoyé deux fois ne produit pas de second traitement", async () => {
    const id = await bench.deliver(bench.pushPayload(scene));
    await bench.settled(id);
    const calls = bench.spy.calls.length;

    await bench.enqueue(id, `push:${scene.repoExternalId}:refs/heads/cadrage`);
    await sleep(2_500);

    expect((await bench.delivery(id)).attempts).toBe(1);
    expect(bench.spy.calls).toHaveLength(calls);
  });

  it("une ligne déjà ignored ou processed est rendue telle quelle, sans écriture", async () => {
    const processedAt = new Date("2026-10-01T10:00:00Z");
    const done = await bench.insertDelivery({ status: "processed", attempts: 2, processedAt });
    const skipped = await bench.insertDelivery({ status: "ignored", errorCode: "unknown_repo" });
    const before = [await bench.delivery(done), await bench.delivery(skipped)];

    for (const id of [done, skipped]) await bench.enqueue(id, `push:${id}:refs/heads/x`);
    await Promise.all([bench.jobCompleted(done), bench.jobCompleted(skipped)]);

    expect([await bench.delivery(done), await bench.delivery(skipped)]).toEqual(before);
    expect(bench.spy.calls).toHaveLength(0);
  });

  it("une reprise depuis processing (job expiré) aboutit : processed, attempts + 1", async () => {
    const id = await bench.deliver(bench.pushPayload(scene), { status: "processing", attempts: 1 });
    const row = await bench.settled(id);
    expect(row).toMatchObject({ status: "processed", attempts: 2 });
  });

  it("une livraison failed ré-enfilée (balayage de TK-46) est retraitée jusqu'à processed", async () => {
    const id = await bench.deliver(bench.pushPayload(scene), {
      status: "failed",
      attempts: 2,
      errorCode: "provider_unavailable",
    });
    // Ligne déjà `failed` : attendre sa sortie, puis la fin du job (rien d'en cours pour le test suivant).
    const row = await bench.settledAfter(id, "failed");
    await bench.jobCompleted(id);
    expect(row).toMatchObject({ status: "processed", attempts: 3, error_code: null });
  });
});

describe("jobs sans livraison exploitable", () => {
  it.each([
    ["livraison inconnue (purgée)", { deliveryId: randomUUID() }],
    ["identifiant non UUID", { deliveryId: "pas-un-uuid" }],
    ["charge vide", {}],
  ])("%s : le job termine normalement, sans effet ni blocage de la clé", async (_name, data) => {
    const id = randomUUID();
    await bench.worker.boss.send(WEBHOOK_DELIVERY_QUEUE, data, { id, singletonKey: "push:0:x" });
    await bench.jobCompleted(id);
    expect(bench.spy.calls).toHaveLength(0);
  });

  it("la liste des codes d'erreur du domaine est fermée à 9 codes", () => {
    expect([...WEBHOOK_DELIVERY_ERROR_CODES].sort()).toEqual(
      [
        "internal",
        "invalid_payload",
        "provider_auth_expired",
        "provider_rate_limited",
        "provider_unavailable",
        "repo_not_found",
        "spec_too_large",
        "unknown_installation",
        "unknown_repo",
      ].sort(),
    );
  });
});
