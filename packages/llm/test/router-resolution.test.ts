import { type AiUsage, revealLlmCredential } from "@koklo/domain";
import { FakeLlm } from "@koklo/domain/testing";
import { describe, expect, it } from "vitest";
import { AiNotConfiguredError } from "../src/index.ts";
import { rejection } from "./support/harness.ts";
import { bench, ORG, REQUEST, spy } from "./support/router-bench.ts";

describe("TK-95 B · résolution usage vers fournisseur et modèle", () => {
  it("sans ligne d'usage : le principal avec son modèle qualifié (A4, Anthropic Sonnet)", async () => {
    const anthropic = FakeLlm.replying("ok");
    const { router } = bench({ providers: { anthropic } });
    const response = await router.complete(REQUEST());
    expect(anthropic.calls.map((c) => c.model)).toEqual(["claude-sonnet-5-5"]);
    expect(response.provider).toBe("anthropic");
    expect(response.model).toBe("claude-sonnet-5-5");
  });

  it("sans ligne, sans principal, sans catalogue : Anthropic en Sonnet quand sa clé existe", async () => {
    const anthropic = FakeLlm.replying("ok");
    const { router } = bench({
      providers: { anthropic },
      routing: { primary: undefined },
      keys: ["anthropic", "openai"],
      catalog: [],
    });
    await router.complete(REQUEST());
    expect(anthropic.calls.map((c) => c.model)).toEqual(["claude-sonnet-5-5"]);
  });

  it.each(["idea_space", "spec_deliverables", "baseline_summary", "ticket_breakdown"] as AiUsage[])(
    "ligne présente pour %s : son fournisseur et son modèle",
    async (usage) => {
      const openai = FakeLlm.replying("ok");
      const anthropic = FakeLlm.replying("ok");
      const { router } = bench({
        providers: { openai, anthropic },
        routing: { usageModels: { [usage]: { provider: "openai", model: "gpt-choisi" } } },
      });
      const response = await router.complete(REQUEST({ usage }));
      expect(openai.calls.map((c) => c.model)).toEqual(["gpt-choisi"]);
      expect(anthropic.calls).toHaveLength(0);
      expect(response.provider).toBe("openai");
    },
  );

  it("la ligne d'un usage ne change pas les autres usages", async () => {
    const anthropic = FakeLlm.replying("ok");
    const { router } = bench({
      providers: { anthropic },
      routing: { usageModels: { idea_space: { provider: "openai", model: "gpt-choisi" } } },
    });
    await router.complete(REQUEST({ usage: "ticket_breakdown" }));
    expect(anthropic.calls).toHaveLength(1);
  });
});

describe("TK-95 B · fournisseur retiré, principal absent, aucune clé", () => {
  it("fournisseur de la ligne retiré : modèle par défaut de la clé du principal", async () => {
    const anthropic = FakeLlm.replying("ok");
    const { router } = bench({
      providers: { anthropic },
      keys: ["anthropic", "openai"],
      defaultModels: { anthropic: "claude-defaut-cle" },
      routing: {
        availableProviders: ["anthropic", "openai"],
        usageModels: { idea_space: { provider: "mistral", model: "mistral-large" } },
      },
    });
    await router.complete(REQUEST());
    expect(anthropic.calls.map((c) => c.model)).toEqual(["claude-defaut-cle"]);
  });

  it("fournisseur retiré, clé du principal sans modèle par défaut : modèle qualifié du catalogue", async () => {
    const openai = FakeLlm.replying("ok");
    const { router } = bench({
      providers: { openai },
      keys: ["openai"],
      routing: {
        primary: "openai",
        fallback: undefined,
        availableProviders: ["openai"],
        usageModels: { idea_space: { provider: "mistral", model: "mistral-large" } },
      },
    });
    await router.complete(REQUEST());
    expect(openai.calls.map((c) => c.model)).toEqual(["openai-qualifie"]);
  });

  it("aucun principal et une seule clé : cette clé", async () => {
    const mistral = FakeLlm.replying("ok");
    const { router } = bench({
      providers: { mistral },
      keys: ["mistral"],
      routing: { primary: undefined, fallback: undefined, availableProviders: ["mistral"] },
    });
    const response = await router.complete(REQUEST());
    expect(response.provider).toBe("mistral");
    expect(mistral.calls.map((c) => c.model)).toEqual(["mistral-qualifie"]);
  });

  it("aucune clé : AiNotConfiguredError, sans aucun appel", async () => {
    const { router, credentials, fakes } = bench({
      keys: [],
      routing: { availableProviders: [] },
    });
    const error = await rejection(router.complete(REQUEST()));
    expect(error).toBeInstanceOf(AiNotConfiguredError);
    expect((error as AiNotConfiguredError).reason).toBe("no-credential");
    expect(credentials.resolved).toEqual([]);
    expect((fakes.anthropic as FakeLlm).calls).toHaveLength(0);
  });

  it("clé déclarée disponible mais non déchiffrable : on passe au candidat suivant", async () => {
    const anthropic = FakeLlm.replying("ok");
    const { router, credentials } = bench({
      providers: { anthropic },
      keys: ["anthropic"],
      routing: { primary: "openai", availableProviders: ["openai", "anthropic"] },
    });
    const response = await router.complete(REQUEST());
    expect(credentials.resolved).toContain("openai");
    expect(response.provider).toBe("anthropic");
  });

  it("l'erreur de non-configuration ne nomme aucun fournisseur", async () => {
    const { router } = bench({ keys: [], routing: { availableProviders: [] } });
    const error = await rejection(router.complete(REQUEST()));
    expect(error.message).not.toMatch(/anthropic|openai|google|mistral|openrouter/i);
  });
});

describe("TK-95 B · requête transmise au fournisseur", () => {
  it("clé révélée au dernier moment, adresse de base, budget, trace, température, annulation", async () => {
    const { provider, requests } = spy();
    const controller = new AbortController();
    const { router } = bench({
      providers: { openai_compatible: provider },
      keys: ["openai_compatible"],
      baseUrls: { openai_compatible: "https://llm.exemple.test/v1" },
      defaultModels: { openai_compatible: "modele-maison" },
      routing: {
        primary: "openai_compatible",
        fallback: undefined,
        availableProviders: ["openai_compatible"],
      },
    });
    const request = REQUEST({ temperature: 0.2, signal: controller.signal });
    await router.complete(request);
    const sent = requests[0];
    expect(sent && revealLlmCredential(sent.credential)).toBe("cle-openai_compatible-SENTINELLE");
    expect(sent).toMatchObject({
      model: "modele-maison",
      baseUrl: "https://llm.exemple.test/v1",
      budget: request.budget,
      trace: request.trace,
      temperature: 0.2,
      signal: controller.signal,
    });
    expect(ORG).toBe(request.organizationId);
  });

  it("sans adresse de base ni température, aucune propriété indéfinie n'est transmise", async () => {
    const { provider, requests } = spy();
    const { router } = bench({ providers: { anthropic: provider } });
    await router.complete(REQUEST());
    expect(Object.keys(requests[0] ?? {}).sort()).toEqual(
      ["budget", "credential", "model", "output", "prompt", "trace"].sort(),
    );
  });
});
