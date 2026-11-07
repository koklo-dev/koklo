import {
  InvalidLlmRequestError,
  LlmAbortedError,
  LlmAuthError,
  LlmBudgetExceededError,
  LlmContextTooLongError,
  LlmInvalidOutputError,
  LlmModelNotFoundError,
  type LlmProviderError,
  LlmProviderUnavailableError,
  LlmQuotaExceededError,
  LlmRateLimitedError,
  LlmRefusedError,
  LlmTimeoutError,
} from "@koklo/domain";
import { FakeLlm } from "@koklo/domain/testing";
import { describe, expect, it } from "vitest";
import { PROMPT_SENTINEL, rejection } from "./support/harness.ts";
import { bench, ORG, REQUEST, spy, throwing } from "./support/router-bench.ts";

const op = { operation: "complete", provider: "anthropic" } as const;
const TRIGGERS: readonly [string, () => LlmProviderError, string][] = [
  ["authentification", () => new LlmAuthError(op), "auth"],
  ["limite de débit", () => new LlmRateLimitedError({ ...op, retryAfterMs: 0 }), "rate_limited"],
  ["quota", () => new LlmQuotaExceededError(op), "quota"],
  ["indisponibilité", () => new LlmProviderUnavailableError(op), "unavailable"],
  ["délai", () => new LlmTimeoutError(op), "timeout"],
];
const NEVER: readonly [string, () => Error][] = [
  ["annulation", () => new LlmAbortedError(op)],
  ["budget", () => new LlmBudgetExceededError({ ...op, limit: "cost" })],
  ["refus", () => new LlmRefusedError(op)],
  ["contexte trop long", () => new LlmContextTooLongError(op)],
  ["sortie invalide", () => new LlmInvalidOutputError("shape")],
  ["modèle introuvable", () => new LlmModelNotFoundError(op)],
  ["prompt rejeté", () => new InvalidLlmRequestError("prompt")],
  ["erreur non typée", () => new Error("boom")],
];

describe("TK-95 B · bascule de secours sur erreur du principal", () => {
  it.each(TRIGGERS)("%s : un seul nouvel essai chez le secours", async (_n, make, reason) => {
    const anthropic = throwing(make() as LlmProviderError);
    const openai = FakeLlm.replying("secours");
    const { router, events } = bench({ providers: { anthropic, openai } });
    const response = await router.complete(REQUEST({ usage: "ticket_breakdown" }));
    expect(response.provider).toBe("openai");
    expect(response.model).toBe("openai-qualifie");
    expect(anthropic.calls).toHaveLength(1);
    expect(openai.calls.map((c) => c.model)).toEqual(["openai-qualifie"]);
    expect(events.events).toEqual([
      {
        type: "llm.fallback",
        organizationId: ORG,
        usage: "ticket_breakdown",
        from: "anthropic",
        to: "openai",
        reason,
      },
    ]);
  });

  it.each(NEVER)("jamais de bascule sur %s : l'erreur d'origine est rendue", async (_n, make) => {
    const failure = make();
    const openai = FakeLlm.replying("secours");
    const { router, events } = bench({ providers: { anthropic: throwing(failure), openai } });
    expect(await rejection(router.complete(REQUEST()))).toBe(failure);
    expect(openai.calls).toHaveLength(0);
    expect(events.events).toEqual([]);
  });
});

describe("TK-95 B · limites de la bascule", () => {
  it("secours désactivé : l'erreur d'origine, aucun appel au secours", async () => {
    const failure = new LlmAuthError(op);
    const openai = FakeLlm.replying("x");
    const { router } = bench({
      providers: { anthropic: throwing(failure), openai },
      routing: { fallbackEnabled: false },
    });
    expect(await rejection(router.complete(REQUEST()))).toBe(failure);
    expect(openai.calls).toHaveLength(0);
  });

  it("aucun secours désigné : l'erreur d'origine", async () => {
    const failure = new LlmTimeoutError(op);
    const { router } = bench({
      providers: { anthropic: throwing(failure) },
      routing: { fallback: undefined },
    });
    expect(await rejection(router.complete(REQUEST()))).toBe(failure);
  });

  it("erreur du secours : l'erreur du secours, un seul essai, pas de boucle", async () => {
    const anthropic = throwing(new LlmAuthError(op));
    const second = new LlmRateLimitedError({
      operation: "complete",
      provider: "openai",
      retryAfterMs: 0,
    });
    const openai = throwing(second);
    const mistral = FakeLlm.replying("jamais");
    const { router } = bench({ providers: { anthropic, openai, mistral } });
    expect(await rejection(router.complete(REQUEST()))).toBe(second);
    expect(anthropic.calls).toHaveLength(1);
    expect(openai.calls).toHaveLength(1);
    expect(mistral.calls).toHaveLength(0);
  });

  it("pas de secours sans modèle qualifié pour l'usage", async () => {
    const failure = new LlmAuthError(op);
    const openai = FakeLlm.replying("x");
    const { router } = bench({
      providers: { anthropic: throwing(failure), openai },
      catalog: [
        {
          provider: "anthropic",
          model: "claude-sonnet-5-5",
          usages: ["idea_space", "ticket_breakdown"],
          economy: false,
        },
        { provider: "openai", model: "gpt-q", usages: ["idea_space"], economy: false },
      ],
    });
    expect(await rejection(router.complete(REQUEST({ usage: "ticket_breakdown" })))).toBe(failure);
    expect(openai.calls).toHaveLength(0);
  });

  it("le secours est le fournisseur du principal : aucun nouvel essai", async () => {
    const failure = new LlmAuthError(op);
    const anthropic = throwing(failure);
    const { router } = bench({ providers: { anthropic }, routing: { fallback: "anthropic" } });
    expect(await rejection(router.complete(REQUEST()))).toBe(failure);
    expect(anthropic.calls).toHaveLength(1);
  });

  it("clé du secours indisponible : l'erreur d'origine", async () => {
    const failure = new LlmAuthError(op);
    const { router } = bench({
      providers: { anthropic: throwing(failure) },
      keys: ["anthropic"],
      routing: { availableProviders: ["anthropic", "openai"] },
    });
    expect(await rejection(router.complete(REQUEST()))).toBe(failure);
  });

  it("appel annulé pendant l'échec : pas de bascule", async () => {
    const failure = new LlmTimeoutError(op);
    const { provider: openai, requests } = spy();
    const controller = new AbortController();
    controller.abort();
    const { router } = bench({ providers: { anthropic: throwing(failure), openai } });
    expect(await rejection(router.complete(REQUEST({ signal: controller.signal })))).toBe(failure);
    expect(requests).toHaveLength(0);
  });

  it("le journal llm.fallback ne porte ni contenu, ni clé, ni modèle", async () => {
    const { router, events } = bench({
      providers: { anthropic: throwing(new LlmAuthError(op)) },
    });
    await router.complete(REQUEST());
    const logged = JSON.stringify(events.events);
    expect(logged).not.toContain(PROMPT_SENTINEL);
    expect(logged).not.toContain("SENTINELLE");
    expect(Object.keys(events.events[0] ?? {}).sort()).toEqual([
      "from",
      "organizationId",
      "reason",
      "to",
      "type",
      "usage",
    ]);
  });

  it("une panne du journal n'empêche pas la bascule", async () => {
    const { router, events } = bench({
      providers: { anthropic: throwing(new LlmAuthError(op)) },
    });
    events.failing = true;
    expect((await router.complete(REQUEST())).provider).toBe("openai");
  });
});
