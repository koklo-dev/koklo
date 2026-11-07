import { FakeLlm } from "@koklo/domain/testing";
import { describe, expect, it } from "vitest";
import { AiCapReachedError } from "../src/index.ts";
import { rejection } from "./support/harness.ts";
import { bench, drain, ORG, REQUEST } from "./support/router-bench.ts";

const CAP = 1_000_000;
const capped = (costMicroUsd: number, extra: Parameters<typeof bench>[0] = {}) =>
  bench({ costMicroUsd, routing: { monthlyCapMicroUsd: CAP }, ...extra });

describe("TK-95 B · plafond mensuel unique : états", () => {
  it("sans plafond saisi (A1), aucune suspension quelle que soit la consommation", async () => {
    const { router } = bench({ costMicroUsd: 9_000_000_000 });
    expect(await router.capState(ORG)).toBe("ok");
    expect((await router.complete(REQUEST())).provider).toBe("anthropic");
  });

  it.each([
    [0, "ok"],
    [799_999, "ok"],
    [800_000, "warning"],
    [999_999, "warning"],
    [1_000_000, "suspended"],
    [2_000_000, "suspended"],
  ] as const)("consommation %i sur 1 000 000 : %s", async (cost, state) => {
    expect(await capped(cost).router.capState(ORG)).toBe(state);
  });
});

describe("TK-95 B · plafond : refus avant tout appel réseau", () => {
  it("à 100 % : AiCapReachedError, ni clé résolue ni appel", async () => {
    const anthropic = FakeLlm.replying("x");
    const { router, credentials } = capped(CAP, { providers: { anthropic } });
    const error = await rejection(router.complete(REQUEST()));
    expect(error).toBeInstanceOf(AiCapReachedError);
    expect(error.message).not.toMatch(/anthropic|openai|google|mistral|openrouter/i);
    expect(credentials.resolved).toEqual([]);
    expect(anthropic.calls).toHaveLength(0);
  });

  it("le flux est refusé de la même façon, à la première lecture", async () => {
    const anthropic = FakeLlm.replying("x");
    const { router } = capped(CAP, { providers: { anthropic } });
    expect(await rejection(drain(router.stream(REQUEST())))).toBeInstanceOf(AiCapReachedError);
    expect(anthropic.calls).toHaveLength(0);
  });

  it("le plafond est unique : la consommation de tous les fournisseurs s'additionne", async () => {
    const { router, meter } = capped(0);
    await meter.record({
      organizationId: ORG,
      provider: "openai",
      inputTokens: 1,
      outputTokens: 1,
      costMicroUsd: 600_000,
    });
    await meter.record({
      organizationId: ORG,
      provider: "mistral",
      inputTokens: 1,
      outputTokens: 1,
      costMicroUsd: 400_000,
    });
    expect(await rejection(router.complete(REQUEST()))).toBeInstanceOf(AiCapReachedError);
  });

  it("changement de mois : repart de zéro, avertissement de nouveau possible", async () => {
    let now = new Date("2026-11-30T23:59:00Z");
    const { router, events } = capped(CAP, { now: () => now });
    await rejection(router.complete(REQUEST()));
    now = new Date("2026-12-01T00:00:00Z");
    expect(await router.capState(ORG)).toBe("ok");
    expect((await router.complete(REQUEST())).provider).toBe("anthropic");
    expect(events.events).toEqual([]);
  });
});

describe("TK-95 B · alerte à 80 % : une seule fois par mois", () => {
  it("en état warning : les appels passent, un seul événement ai.cap_warning", async () => {
    const { router, events } = capped(850_000);
    await router.complete(REQUEST());
    await router.complete(REQUEST());
    await router.complete(REQUEST());
    expect(events.events).toEqual([{ type: "ai.cap_warning", organizationId: ORG }]);
  });

  it("l'appel qui franchit les 80 % déclenche l'alerte", async () => {
    const { router, events } = capped(799_999);
    await router.complete(REQUEST());
    expect(events.events).toEqual([{ type: "ai.cap_warning", organizationId: ORG }]);
  });

  it("marqueur persisté : un autre moteur sur le même compteur ne la rejoue pas", async () => {
    const first = capped(850_000);
    await first.router.complete(REQUEST());
    const second = bench({ routing: { monthlyCapMicroUsd: CAP }, meter: first.meter });
    await second.router.complete(REQUEST());
    expect(second.events.events).toEqual([]);
  });

  it("déjà alerté ce mois-ci : aucun nouvel événement", async () => {
    const { router, events } = capped(850_000, { warned: true });
    await router.complete(REQUEST());
    expect(events.events).toEqual([]);
  });

  it("sous les 80 % : aucun événement", async () => {
    const { router, events } = capped(100);
    await router.complete(REQUEST());
    expect(events.events).toEqual([]);
  });

  it("une panne du journal n'empêche pas l'appel", async () => {
    const { router, events } = capped(850_000);
    events.failing = true;
    expect((await router.complete(REQUEST())).provider).toBe("anthropic");
  });
});
