import { RECONCILE_MAX_REQUEUES_DEFAULT } from "@koklo/domain";
import type { PgBoss } from "pg-boss";
import { describe, expect, it, vi } from "vitest";
import { batchesPass, deliveriesPass } from "../src/reconcile/passes.ts";
import type { ReconcileStore } from "../src/reconcile/store.ts";

function fakes() {
  const store = {
    unsettledDeliveries: vi.fn(async () => []),
    openBatches: vi.fn(async () => []),
    recordBatchRequeued: vi.fn(async () => {}),
  };
  const deps = {
    boss: {} as PgBoss,
    store: store as unknown as ReconcileStore,
    graceMinutes: 15,
    retentionDays: 30,
    now: () => new Date("2026-01-01T00:00:00Z"),
  };
  return { store, deps };
}

describe("reconcile-requeue-cap : plafond par passe", () => {
  it("la passe P1 ne lit pas plus de RECONCILE_MAX_REQUEUES_DEFAULT livraisons", async () => {
    const { store, deps } = fakes();
    await deliveriesPass(deps)();
    expect(store.unsettledDeliveries).toHaveBeenCalledWith(
      expect.any(Date),
      expect.any(Date),
      RECONCILE_MAX_REQUEUES_DEFAULT,
    );
  });

  it("la passe P2 ne lit pas plus de RECONCILE_MAX_REQUEUES_DEFAULT lots", async () => {
    const { store, deps } = fakes();
    await batchesPass(deps)();
    expect(store.openBatches).toHaveBeenCalledWith(
      expect.any(Date),
      RECONCILE_MAX_REQUEUES_DEFAULT,
    );
  });

  it("un plafond explicite remplace le défaut", async () => {
    const { store, deps } = fakes();
    await batchesPass({ ...deps, maxRequeues: 3 })();
    expect(store.openBatches).toHaveBeenCalledWith(expect.any(Date), 3);
  });
});
