import {
  InvalidLlmRequestError,
  LlmInvalidOutputError,
  LlmProviderUnavailableError,
  LlmQuotaExceededError,
  LlmRateLimitedError,
  LlmRefusedError,
  LlmTimeoutError,
  llmCredential,
  unvalidated,
} from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { boundedResponse } from "../src/common/bounded-body.ts";
import { errorForStatus, errorMessageOf, retryAfterMs } from "../src/common/errors.ts";
import { guardedFetch } from "../src/common/guarded-fetch.ts";
import {
  assertResolvesPublic,
  assertSafeBaseUrl,
  runQualification,
  systemHostResolver,
  UnsafeBaseUrlError,
} from "../src/index.ts";
import { toPortError } from "../src/sdk/sdk-errors.ts";
import { servedModelOf, stopOf, usageOf } from "../src/sdk/sdk-result.ts";
import { rejection } from "./support/harness.ts";
import { providerFor, requestFor, scripted } from "./support/sdk-bench.ts";
import { okResponse } from "./support/sdk-bodies.ts";

const ctx = { provider: "openai", operation: "complete" } as const;

describe("erreurs HTTP communes", () => {
  it("429 « quota épuisé » (facturation) est un quota, pas une limite de débit", () => {
    expect(
      errorForStatus(
        ctx,
        429,
        null,
        JSON.stringify({ error: { message: "You exceeded your current quota" } }),
      ),
    ).toBeInstanceOf(LlmQuotaExceededError);
    expect(errorForStatus(ctx, 429, "abc", "")).toBeInstanceOf(LlmRateLimitedError);
    expect(errorForStatus(ctx, 418, null, "")).toBeInstanceOf(LlmProviderUnavailableError);
  });
  it("retry-after : secondes entières seulement", () => {
    expect(retryAfterMs("12")).toBe(12_000);
    for (const bad of ["-1", "1.5", "1e3", "Wed, 21 Oct", "", null, undefined]) {
      expect(retryAfterMs(bad)).toBe(0);
    }
  });
  it("message d'erreur : error.message, puis message, sinon vide", () => {
    expect(errorMessageOf('{"message":"m"}')).toBe("m");
    expect(errorMessageOf('{"error":{"message":"e"}}')).toBe("e");
    expect(errorMessageOf("pas du json")).toBe("");
    expect(errorMessageOf("null")).toBe("");
  });
});

describe("transport gardé", () => {
  it("lit globalThis.fetch à chaque appel, accepte URL et Request, force redirect error", async () => {
    const seen: RequestInit[] = [];
    const inner = async (_url: string, init: RequestInit) => {
      seen.push(init);
      return new Response(null, { status: 204 });
    };
    const send = guardedFetch(inner, ctx);
    await send(new URL("https://a.test/x"));
    await send(new Request("https://a.test/y"), { redirect: "follow" });
    expect(seen.map((i) => i.redirect)).toEqual(["error", "error"]);
    await expect(guardedFetch(undefined, ctx)("https://a.test")).rejects.toThrow(
      "fetch global interdit",
    );
  });
  it("un corps absent passe tel quel ; un corps annulé par le lecteur est libéré", async () => {
    const empty = new Response(null, { status: 204 });
    expect(await boundedResponse(empty, ctx)).toBe(empty);
    const wrapped = await boundedResponse(new Response("abc"), ctx);
    await wrapped.body?.cancel();
    expect(wrapped.status).toBe(200);
  });
});

describe("résultats du SDK", () => {
  it("raisons d'arrêt", () => {
    expect(stopOf({ finishReason: "stop" }, ctx)).toBe("end");
    expect(stopOf({ finishReason: "stop", rawFinishReason: "stop_sequence" }, ctx)).toBe(
      "stop-sequence",
    );
    expect(stopOf({ finishReason: "length" }, ctx)).toBe("max-tokens");
    expect(() => stopOf({ finishReason: "other" }, ctx)).toThrow(LlmProviderUnavailableError);
    expect(() => stopOf({ finishReason: "other", rawFinishReason: "refusal" }, ctx)).toThrow(
      LlmRefusedError,
    );
  });
  it("jetons : seuls les entiers sûrs positifs comptent ; modèle servi hors motif refusé", () => {
    expect(usageOf({ inputTokens: 3, outputTokens: undefined })).toEqual({
      inputTokens: 3,
      outputTokens: 0,
    });
    expect(usageOf({ inputTokens: -1, outputTokens: 1.5 })).toEqual({
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(servedModelOf("a/b", ctx)).toBe("a/b");
    expect(() => servedModelOf("../x", ctx)).toThrow(LlmProviderUnavailableError);
    expect(() => servedModelOf(undefined, ctx)).toThrow(LlmProviderUnavailableError);
  });
  it("erreurs du SDK : délai nommé TimeoutError, sortie invalide, inconnue", () => {
    const signals = { caller: undefined, deadline: new AbortController().signal };
    const timeout = Object.assign(new Error("x"), { name: "TimeoutError" });
    expect(toPortError(timeout, ctx, signals)).toBeInstanceOf(LlmTimeoutError);
    expect(toPortError(new Error("boum"), ctx, signals)).toBeInstanceOf(
      LlmProviderUnavailableError,
    );
    expect(
      toPortError(
        { cause: { cause: new LlmRefusedError({ operation: "complete" }) } },
        ctx,
        signals,
      ),
    ).toBeInstanceOf(LlmRefusedError);
    expect(toPortError(null, ctx, signals)).toBeInstanceOf(LlmProviderUnavailableError);
  });
});

describe("adaptateur : cas limites", () => {
  it("un modèle « a/b » est refusé quand il entre dans l'URL, admis chez les intermédiaires", async () => {
    const t = scripted(() => okResponse("openai", "ok"));
    const slash = { model: "vendeur/modele" };
    for (const id of ["google", "openai", "anthropic", "mistral"] as const) {
      expect(
        await rejection(providerFor(id, t.fetch).complete(requestFor(id, slash))),
      ).toBeInstanceOf(InvalidLlmRequestError);
    }
    await providerFor("openrouter", t.fetch).complete(requestFor("openrouter", slash));
    expect(t.calls).toHaveLength(1);
  });
  it("la température est transmise telle quelle", async () => {
    const t = scripted(() => okResponse("openai", "ok"));
    await providerFor("openai", t.fetch).complete(requestFor("openai", { temperature: 0.25 }));
    expect(String(t.calls[0]?.init.body)).toContain('"temperature":0.25');
  });
  it("un flux qui s'arrête sans raison finale est inutilisable", async () => {
    const t = scripted(
      () =>
        new Response("data: [DONE]\n\n", {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
    );
    const run = async () => {
      for await (const _ of providerFor("openai", t.fetch).stream(requestFor("openai"))) {
        // vidé
      }
    };
    expect(await rejection(run())).toBeInstanceOf(LlmProviderUnavailableError);
  });
  it("erreur du flux (statut 500) -> erreur typée", async () => {
    const t = scripted(() => new Response("boum", { status: 500 }));
    const run = async () => {
      for await (const _ of providerFor("anthropic", t.fetch).stream(requestFor("anthropic"))) {
        // vidé
      }
    };
    expect(await rejection(run())).toBeInstanceOf(LlmProviderUnavailableError);
  });
});

describe("anti-SSRF : résolution", () => {
  it("le résolveur système voit localhost comme privé ; un nom en échec est refusé", async () => {
    const url = assertSafeBaseUrl("https://exemple.test");
    await expect(assertResolvesPublic(url, systemHostResolver)).rejects.toBeInstanceOf(
      UnsafeBaseUrlError,
    );
    await expect(
      assertResolvesPublic(url, async () => {
        throw new Error("NXDOMAIN");
      }),
    ).rejects.toBeInstanceOf(UnsafeBaseUrlError);
    await expect(
      assertResolvesPublic(assertSafeBaseUrl("https://93.184.216.34"), async () => []),
    ).resolves.toBeUndefined();
  });
});

describe("qualification : cas limites", () => {
  const contracts = {
    idea_space: { jsonSchema: {}, accepts: () => true },
    spec_deliverables: { jsonSchema: {}, accepts: () => true },
    baseline_summary: { jsonSchema: {}, accepts: () => true },
    ticket_breakdown: { jsonSchema: {}, accepts: () => true },
  };
  const run = (complete: () => Promise<unknown>) =>
    runQualification({
      provider: { id: "fake", stream: async function* () {}, complete: complete as never },
      providerId: "openai_compatible",
      model: "m",
      credential: llmCredential("k"),
      baseUrl: "https://x.test/v1",
      contracts,
    });
  const response = (stop: string) => async () => ({
    output: unvalidated({}),
    stop,
    usage: { inputTokens: 1, outputTokens: 1 },
    provider: "fake",
    model: "m",
  });
  it("classe refus, JSON invalide, arrêt « refusal » et erreurs", async () => {
    const reasons = async (complete: () => Promise<unknown>) =>
      (await run(complete)).usages.idea_space.failures.map((f) => f.reason);
    expect(
      await reasons(async () => {
        throw new LlmRefusedError({ operation: "complete" });
      }),
    ).toEqual(["refused", "refused", "refused"]);
    expect(
      await reasons(async () => {
        throw new LlmInvalidOutputError("shape");
      }),
    ).toEqual(["invalid-json", "invalid-json", "invalid-json"]);
    expect(await reasons(response("refusal"))).toEqual(["refused", "refused", "refused"]);
    expect(await reasons(response("stop-sequence"))).toEqual([]);
  });
});
