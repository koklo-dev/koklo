import { FakeLlm } from "@koklo/domain/testing";
import { describe, expect, it } from "vitest";
import { AiCapReachedError, AiNotConfiguredError } from "../src/index.ts";
import { rejection } from "./support/harness.ts";
import { bench, ORG, REQUEST } from "./support/router-bench.ts";

/**
 * TK-95 D : `preflight` refuse AVANT toute écriture d'audit ou de quota de l'appelant (plafond atteint,
 * aucun fournisseur utilisable), sans appel au modèle, sans comptage ni signalement de clé.
 */
describe("TK-95 D · contrôle préalable du moteur", () => {
  it("plafond atteint : AiCapReachedError, aucun appel, aucune clé résolue", async () => {
    const anthropic = FakeLlm.replying("x");
    const { router, credentials } = bench({
      costMicroUsd: 1_000_000,
      routing: { monthlyCapMicroUsd: 1_000_000 },
      providers: { anthropic },
    });
    expect(await rejection(router.preflight(REQUEST()))).toBeInstanceOf(AiCapReachedError);
    expect(credentials.resolved).toEqual([]);
    expect(anthropic.calls).toHaveLength(0);
  });

  it("aucune clé utilisable : AiNotConfiguredError", async () => {
    const { router } = bench({ keys: [], routing: { availableProviders: [] } });
    expect(await rejection(router.preflight(REQUEST()))).toBeInstanceOf(AiNotConfiguredError);
  });

  it("appel possible : rien n'est appelé, compté ni signalé", async () => {
    const anthropic = FakeLlm.replying("x");
    const used: string[] = [];
    const { router, meter } = bench({
      providers: { anthropic },
      hooks: { used: async (e) => void used.push(e.provider), rejected: async () => undefined },
    });
    await router.preflight(REQUEST());
    expect(anthropic.calls).toHaveLength(0);
    expect(meter.entries).toEqual([]);
    expect(used).toEqual([]);
  });

  it("à 80 % : l'alerte est émise une seule fois, avec l'utilisateur de l'appel", async () => {
    const { router, events } = bench({
      costMicroUsd: 850_000,
      routing: { monthlyCapMicroUsd: 1_000_000 },
    });
    await router.preflight(REQUEST({ userId: "user-0001" }));
    await router.preflight(REQUEST({ userId: "user-0001" }));
    expect(events.events).toEqual([
      { type: "ai.cap_warning", organizationId: ORG, userId: "user-0001" },
    ]);
  });
});
