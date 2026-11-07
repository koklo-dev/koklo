import { type AiKeyHooks, LlmAuthError, LlmRateLimitedError } from "@koklo/domain";
import { FakeLlm } from "@koklo/domain/testing";
import { describe, expect, it } from "vitest";
import { rejection } from "./support/harness.ts";
import { bench, ORG, REQUEST, throwing } from "./support/router-bench.ts";

/**
 * TK-95 D : la vie d'une clé (dernier usage, rejet 401 avec compare-and-swap) est signalée par le moteur,
 * qui est seul à savoir quel fournisseur a réellement été servi (secours compris).
 */
const recorder = () => {
  const used: { organizationId: string; provider: string }[] = [];
  const rejected: { organizationId: string; provider: string; revision?: string }[] = [];
  const hooks: AiKeyHooks = {
    used: async (event) => void used.push(event),
    rejected: async (event) => void rejected.push(event),
  };
  return { hooks, used, rejected };
};
const auth = (status: number) =>
  new LlmAuthError({ operation: "complete", provider: "anthropic", status });

describe("TK-95 D · signalement de la vie des clés par le moteur", () => {
  it("succès : la clé du fournisseur servi est marquée utilisée, une seule fois", async () => {
    const { hooks, used, rejected } = recorder();
    const { router } = bench({ hooks });
    await router.complete(REQUEST());
    expect(used).toEqual([{ organizationId: ORG, provider: "anthropic" }]);
    expect(rejected).toEqual([]);
  });

  it("secours : seule la clé du fournisseur servi est marquée utilisée", async () => {
    const { hooks, used } = recorder();
    const { router } = bench({
      hooks,
      providers: {
        anthropic: throwing(
          new LlmRateLimitedError({
            operation: "complete",
            provider: "anthropic",
            retryAfterMs: 0,
          }),
        ),
        openai: FakeLlm.replying("ok"),
      },
    });
    const response = await router.complete(REQUEST());
    expect(response.provider).toBe("openai");
    expect(used).toEqual([{ organizationId: ORG, provider: "openai" }]);
  });

  it("401 : la clé rejetée est signalée avec sa révision et l'utilisateur de l'appel", async () => {
    const { hooks, rejected } = recorder();
    const { router } = bench({
      hooks,
      revisions: { anthropic: "rev-a" },
      providers: { anthropic: throwing(auth(401)) },
      routing: { fallbackEnabled: false },
    });
    await rejection(router.complete(REQUEST({ userId: "user-0001" })));
    expect(rejected).toEqual([
      { organizationId: ORG, provider: "anthropic", revision: "rev-a", userId: "user-0001" },
    ]);
  });

  it("401 sans utilisateur : aucune clé `userId` dans le signalement", async () => {
    const { hooks, rejected } = recorder();
    const { router } = bench({
      hooks,
      providers: { anthropic: throwing(auth(401)) },
      routing: { fallbackEnabled: false },
    });
    await rejection(router.complete(REQUEST()));
    expect(Object.keys(rejected[0] ?? {}).sort()).toEqual(["organizationId", "provider"]);
  });

  it.each([403, undefined])(
    "statut %s : la clé n'est pas rejetée (seul un 401 explicite l'est)",
    async (status) => {
      const { hooks, rejected } = recorder();
      const error = new LlmAuthError({
        operation: "complete",
        provider: "anthropic",
        ...(status === undefined ? {} : { status }),
      });
      const { router } = bench({
        hooks,
        providers: { anthropic: throwing(error) },
        routing: { fallbackEnabled: false },
      });
      await rejection(router.complete(REQUEST()));
      expect(rejected).toEqual([]);
    },
  );

  it("401 chez le principal puis secours réussi : le principal est signalé, la réponse est rendue", async () => {
    const { hooks, rejected, used } = recorder();
    const { router } = bench({
      hooks,
      providers: { anthropic: throwing(auth(401)), openai: FakeLlm.replying("ok") },
    });
    const response = await router.complete(REQUEST());
    expect(response.provider).toBe("openai");
    expect(rejected.map((e) => e.provider)).toEqual(["anthropic"]);
    expect(used.map((e) => e.provider)).toEqual(["openai"]);
  });

  it("une panne des signalements ne casse pas l'appel", async () => {
    const hooks: AiKeyHooks = {
      used: async () => {
        throw new Error("base indisponible");
      },
      rejected: async () => {
        throw new Error("base indisponible");
      },
    };
    const { router } = bench({ hooks });
    const response = await router.complete(REQUEST());
    expect(response.provider).toBe("anthropic");
  });

  it("l'alerte de plafond et la bascule portent l'utilisateur de l'appel quand il est connu", async () => {
    const { router, events } = bench({
      costMicroUsd: 850_000,
      routing: { monthlyCapMicroUsd: 1_000_000 },
    });
    await router.complete(REQUEST({ userId: "user-0001" }));
    expect(events.events).toEqual([
      { type: "ai.cap_warning", organizationId: ORG, userId: "user-0001" },
    ]);
  });

  it("flux : la clé du fournisseur servi est marquée utilisée à l'événement final", async () => {
    const { hooks, used } = recorder();
    const { router } = bench({ hooks });
    for await (const _event of router.stream(REQUEST())) {
      // consommation complète
    }
    expect(used).toEqual([{ organizationId: ORG, provider: "anthropic" }]);
  });
});
