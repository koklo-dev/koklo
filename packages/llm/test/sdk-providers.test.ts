import {
  LLM_PROVIDER_IDS,
  LlmAbortedError,
  LlmAuthError,
  LlmBudgetExceededError,
  LlmContextTooLongError,
  LlmInvalidOutputError,
  LlmModelNotFoundError,
  type LlmProviderId,
  LlmProviderUnavailableError,
  LlmQuotaExceededError,
  LlmRateLimitedError,
  LlmRefusedError,
  type LlmStreamEvent,
  LlmTimeoutError,
} from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { expectNoLeak, rejection } from "./support/harness.ts";
import { BUDGET, providerFor, requestFor, scripted } from "./support/sdk-bench.ts";
import {
  errorResponse,
  FORMAT_OF,
  HOST_OF,
  okResponse,
  SERVED,
  streamResponse,
  USAGE,
} from "./support/sdk-bodies.ts";

const KEY = "cle-de-test-SENTINELLE-9876";
const each = LLM_PROVIDER_IDS.map((id) => [id] as [LlmProviderId]);

describe.each(each)("adaptateur SDK %s : complete", (id) => {
  const format = FORMAT_OF[id];

  it("appelle l'hôte attendu, une seule fois, avec la clé passée et sans redirection", async () => {
    const t = scripted(() => okResponse(format, "bonjour"));
    const response = await providerFor(id, t.fetch).complete(requestFor(id));
    expect(t.calls).toHaveLength(1);
    expect(new URL(t.calls[0]?.url ?? "").host).toBe(HOST_OF[id]);
    expect(t.calls[0]?.init.redirect).toBe("error");
    expect(JSON.stringify(t.calls[0]?.init.headers)).toContain(KEY);
    expect(response).toMatchObject({
      provider: id,
      // Google ne renvoie pas le modèle servi : le SDK rend le modèle demandé.
      model: id === "google" ? "modele-demande-1" : SERVED,
      stop: "end",
      usage: { inputTokens: USAGE.input, outputTokens: USAGE.output },
    });
    expect(response.output as unknown).toBe("bonjour");
  });

  it("sortie JSON : analysée mais jamais validée ; JSON invalide -> LlmInvalidOutputError", async () => {
    const t = scripted(
      () => okResponse(format, '{"a":1}'),
      () => okResponse(format, "pas du json"),
    );
    const provider = providerFor(id, t.fetch);
    const request = requestFor(id, { output: { kind: "json", schema: { type: "object" } } });
    expect((await provider.complete(request)).output as unknown).toEqual({ a: 1 });
    expect(await rejection(provider.complete(request))).toBeInstanceOf(LlmInvalidOutputError);
  });

  it("n'effectue aucun nouvel essai implicite (maxRetries 0) sur 429, 500 et 529", async () => {
    for (const status of [429, 500, 529]) {
      const t = scripted(
        () => errorResponse(status, "x"),
        () => okResponse(format, "ok"),
      );
      await rejection(providerFor(id, t.fetch).complete(requestFor(id)));
      expect(t.calls, String(status)).toHaveLength(1);
    }
  });

  it("ne lit aucune variable d'environnement du SDK : la clé passée est toujours celle envoyée", async () => {
    const names = [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GOOGLE_GENERATIVE_AI_API_KEY",
      "MISTRAL_API_KEY",
      "OPENROUTER_API_KEY",
      "ANTHROPIC_BASE_URL",
      "OPENAI_BASE_URL",
    ];
    for (const name of names) process.env[name] = "ENV-CANARI-INTERDIT";
    try {
      const t = scripted(() => okResponse(format, "ok"));
      await providerFor(id, t.fetch).complete(requestFor(id));
      const sent = JSON.stringify(t.calls[0]?.init.headers);
      expect(sent).toContain(KEY);
      expect(sent + t.calls[0]?.url).not.toContain("ENV-CANARI-INTERDIT");
    } finally {
      for (const name of names) delete process.env[name];
    }
  });

  it.each([
    [401, LlmAuthError],
    [403, LlmAuthError],
    [402, LlmQuotaExceededError],
    [404, LlmModelNotFoundError],
    [408, LlmTimeoutError],
    [413, LlmContextTooLongError],
    [429, LlmRateLimitedError],
    [500, LlmProviderUnavailableError],
    [503, LlmProviderUnavailableError],
  ] as const)(
    "statut %i -> erreur typée, sans message ni corps du fournisseur",
    async (status, expected) => {
      const t = scripted(() =>
        errorResponse(status, "CORPS-ERREUR-SENTINELLE", {
          "retry-after": "7",
          "x-secret": "EN-TETE-SENTINELLE",
        }),
      );
      const error = await rejection(providerFor(id, t.fetch).complete(requestFor(id)));
      expect(error).toBeInstanceOf(expected);
      expect(
        expectNoLeak(error, [KEY, "CORPS-ERREUR-SENTINELLE", "EN-TETE-SENTINELLE", HOST_OF[id]]),
      ).toEqual([]);
      expect((error as { provider?: string }).provider).toBe(id);
      if (status === 429) expect((error as LlmRateLimitedError).retryAfterMs).toBe(7000);
    },
  );

  it("un 400 « contexte trop long » est reconnu, tout autre 400 est indisponible", async () => {
    const t = scripted(
      () => errorResponse(400, "prompt is too long: 300000 tokens > 200000"),
      () => errorResponse(400, "maximum context length is 8192 tokens"),
      () => errorResponse(400, "autre chose"),
    );
    const provider = providerFor(id, t.fetch);
    expect(await rejection(provider.complete(requestFor(id)))).toBeInstanceOf(
      LlmContextTooLongError,
    );
    expect(await rejection(provider.complete(requestFor(id)))).toBeInstanceOf(
      LlmContextTooLongError,
    );
    expect(await rejection(provider.complete(requestFor(id)))).toBeInstanceOf(
      LlmProviderUnavailableError,
    );
  });

  it("majorant de coût : refusé avant tout appel réseau", async () => {
    const t = scripted(() => okResponse(format, "ok"));
    const request = requestFor(id, { budget: { ...BUDGET, maxCostMicroUsd: 1 } });
    if (id === "openai_compatible") {
      // prix saisi par l'organisation (B48) : majorant nul, l'appel a lieu
      await expect(providerFor(id, t.fetch).complete(request)).resolves.toBeDefined();
      expect(t.calls).toHaveLength(1);
      return;
    }
    const error = await rejection(providerFor(id, t.fetch).complete(request));
    expect(error).toBeInstanceOf(LlmBudgetExceededError);
    expect(t.calls).toHaveLength(0);
  });

  it("annulation de l'appelant -> LlmAbortedError ; délai du budget -> LlmTimeoutError", async () => {
    const hang = ({ init }: { init: RequestInit }) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    const controller = new AbortController();
    const t1 = scripted(hang);
    const pending = rejection(
      providerFor(id, t1.fetch).complete(requestFor(id, { signal: controller.signal })),
    );
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    expect(await pending).toBeInstanceOf(LlmAbortedError);
    const t2 = scripted(hang);
    const slow = requestFor(id, { budget: { ...BUDGET, timeoutMs: 30 } });
    expect(await rejection(providerFor(id, t2.fetch).complete(slow))).toBeInstanceOf(
      LlmTimeoutError,
    );
  });

  // Mistral n'a aucune raison d'arrêt « filtre de contenu » : un refus n'y est pas observable.
  it.skipIf(id === "mistral")(
    "refus du modèle (filtre de contenu) -> LlmRefusedError",
    async () => {
      const body =
        FORMAT_OF[id] === "anthropic"
          ? {
              id: "m",
              type: "message",
              role: "assistant",
              model: SERVED,
              content: [{ type: "text", text: "" }],
              stop_reason: "refusal",
              usage: { input_tokens: 1, output_tokens: 1 },
            }
          : FORMAT_OF[id] === "google"
            ? {
                candidates: [
                  {
                    content: { role: "model", parts: [{ text: "" }] },
                    finishReason: "SAFETY",
                    index: 0,
                  },
                ],
                usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 0 },
              }
            : {
                id: "c",
                object: "chat.completion",
                created: 1,
                model: SERVED,
                choices: [
                  {
                    index: 0,
                    message: { role: "assistant", content: "" },
                    finish_reason: "content_filter",
                  },
                ],
                usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 },
              };
      const t = scripted(
        () =>
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      );
      expect(await rejection(providerFor(id, t.fetch).complete(requestFor(id)))).toBeInstanceOf(
        LlmRefusedError,
      );
    },
  );
});

const collect = async (events: AsyncIterable<LlmStreamEvent>) => {
  const out: LlmStreamEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
};

describe.each(each)("adaptateur SDK %s : stream", (id) => {
  it("rend les morceaux de texte puis un événement final (arrêt, jetons, modèle servi)", async () => {
    const t = scripted(() =>
      streamResponse(FORMAT_OF[id], ["Bon", "jour"], { usageInFinishChunk: id === "mistral" }),
    );
    const events = await collect(providerFor(id, t.fetch).stream(requestFor(id)));
    expect(
      events
        .filter((e) => e.type === "text")
        .map((e) => (e as { text: string }).text)
        .join(""),
    ).toBe("Bonjour");
    expect(events.at(-1)).toMatchObject({
      type: "end",
      stop: "end",
      provider: id,
      usage: { inputTokens: USAGE.input, outputTokens: USAGE.output },
    });
    expect(events.filter((e) => e.type === "end")).toHaveLength(1);
    expect(t.calls[0]?.init.redirect).toBe("error");
  });

  it("refuse la sortie JSON en flux et applique le majorant de coût avant tout appel", async () => {
    const t = scripted(() => streamResponse(FORMAT_OF[id], ["a", "b"]));
    const provider = providerFor(id, t.fetch);
    expect(
      await rejection(
        collect(provider.stream(requestFor(id, { output: { kind: "json", schema: {} } }))),
      ),
    ).toMatchObject({ reason: "output" });
    if (id !== "openai_compatible") {
      const dear = requestFor(id, { budget: { ...BUDGET, maxCostMicroUsd: 1 } });
      expect(await rejection(collect(provider.stream(dear)))).toBeInstanceOf(
        LlmBudgetExceededError,
      );
    }
    expect(t.calls).toHaveLength(0);
  });

  it("annulation en cours de flux -> LlmAbortedError", async () => {
    const t = scripted(() => streamResponse(FORMAT_OF[id], ["Bon", "jour"]));
    const controller = new AbortController();
    const run = async () => {
      for await (const event of providerFor(id, t.fetch).stream(
        requestFor(id, { signal: controller.signal }),
      )) {
        if (event.type === "text") controller.abort();
      }
    };
    expect(await rejection(run())).toBeInstanceOf(LlmAbortedError);
  });
});
