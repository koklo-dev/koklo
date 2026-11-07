import { LlmAuthError, LlmTimeoutError } from "@koklo/domain";
import { FakeLlm } from "@koklo/domain/testing";
import { describe, expect, it } from "vitest";
import { actualCostMicroUsd, priceFor } from "../src/index.ts";
import { rejection } from "./support/harness.ts";
import { bench, ORG, REQUEST, spy } from "./support/router-bench.ts";

const USAGE = { inputTokens: 1_000, outputTokens: 500 };

describe("TK-95 B · coût réel et comptage par fournisseur", () => {
  it("coût = tarif x jetons réels, compté chez le fournisseur servi", async () => {
    const { provider } = spy({ usage: USAGE, model: "claude-sonnet-5-5" });
    const { router, meter } = bench({ providers: { anthropic: provider } });
    await router.complete(REQUEST());
    const expected = actualCostMicroUsd("anthropic", "claude-sonnet-5-5", USAGE);
    expect(expected).toBeGreaterThan(0);
    expect(meter.entries).toEqual([
      {
        organizationId: ORG,
        provider: "anthropic",
        inputTokens: 1_000,
        outputTokens: 500,
        costMicroUsd: expected,
      },
    ]);
  });

  it("modèle servi inconnu : pire tarif connu, jamais zéro", async () => {
    const { provider } = spy({ usage: USAGE, model: "modele-inconnu" });
    const { router, meter } = bench({ providers: { anthropic: provider } });
    await router.complete(REQUEST());
    const worst = priceFor("anthropic", "modele-inconnu");
    expect(meter.entries[0]?.costMicroUsd).toBe(
      Math.ceil(1_000 * worst.inputUsdPerMTok + 500 * worst.outputUsdPerMTok),
    );
    expect(meter.entries[0]?.costMicroUsd).toBeGreaterThan(0);
  });

  it("point d'accès compatible : jetons comptés, coût nul (B48)", async () => {
    const { provider } = spy({ usage: USAGE });
    const { router, meter } = bench({
      providers: { openai_compatible: provider },
      keys: ["openai_compatible"],
      defaultModels: { openai_compatible: "maison" },
      routing: {
        primary: "openai_compatible",
        fallback: undefined,
        availableProviders: ["openai_compatible"],
      },
    });
    await router.complete(REQUEST());
    expect(meter.entries[0]).toMatchObject({
      provider: "openai_compatible",
      inputTokens: 1_000,
      costMicroUsd: 0,
    });
  });

  it("deux appels : deux enregistrements, cumul par fournisseur", async () => {
    const { provider } = spy({ usage: USAGE, model: "claude-sonnet-5-5" });
    const { router, meter } = bench({ providers: { anthropic: provider } });
    await Promise.all([router.complete(REQUEST()), router.complete(REQUEST())]);
    expect(meter.totals("anthropic")).toMatchObject({
      calls: 2,
      inputTokens: 2_000,
      outputTokens: 1_000,
    });
  });

  it("un appel en erreur ne compte rien", async () => {
    const op = { operation: "complete", provider: "anthropic" } as const;
    const { router, meter } = bench({
      providers: { anthropic: FakeLlm.failing(new LlmAuthError(op)) },
      routing: { fallbackEnabled: false },
    });
    await rejection(router.complete(REQUEST()));
    expect(meter.entries).toEqual([]);
  });

  it("la bascule compte chez le fournisseur servi, pas chez le principal", async () => {
    const op = { operation: "complete", provider: "anthropic" } as const;
    const { router, meter } = bench({
      providers: { anthropic: FakeLlm.failing(new LlmTimeoutError(op)) },
    });
    await router.complete(REQUEST());
    expect(meter.entries.map((e) => e.provider)).toEqual(["openai"]);
  });

  it("la panne du compteur est rendue, jamais avalée (le plafond reste fiable)", async () => {
    const { router, meter } = bench();
    meter.failing = true;
    await expect(router.complete(REQUEST())).rejects.toThrow();
  });
});
