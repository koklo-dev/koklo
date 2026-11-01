import { InvalidLlmRequestError, LlmProviderUnavailableError } from "@koklo/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../src/index.ts";
import { bench, makeRequest, rejection } from "./support/harness.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isolation de l'adaptateur : URL fixe, environnement ignoré, pas de redirection", () => {
  it("ANTHROPIC_BASE_URL, ANTHROPIC_API_KEY et ANTHROPIC_AUTH_TOKEN sont ignorés", async () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://evil.example");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-env-AUTRE-CLE");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "token-env-AUTRE");
    const { transport, provider, sentKeys } = bench();
    transport.enqueue({ kind: "message", text: "ok" });
    await provider.complete(makeRequest());
    expect(transport.requests[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(sentKeys).toHaveLength(1);
    expect(sentKeys[0]).not.toContain("AUTRE");
    expect(JSON.stringify(transport.requests)).not.toContain("evil.example");
  });

  it("les options n'acceptent aucune URL : une URL passée est ignorée", async () => {
    const { transport } = bench();
    transport.enqueue({ kind: "message", text: "ok" });
    const provider = new AnthropicProvider({
      fetch: transport.fetch,
      baseURL: "https://evil.example",
      baseUrl: "https://evil.example",
      url: "https://evil.example",
    } as never);
    await provider.complete(makeRequest());
    expect(transport.requests.map((r) => r.url)).toEqual(["https://api.anthropic.com/v1/messages"]);
  });

  it("demande au transport de refuser les redirections (redirect: error)", async () => {
    const { transport, provider } = bench();
    transport.enqueue({ kind: "message", text: "ok" });
    await provider.complete(makeRequest());
    expect(transport.requests[0]?.redirect).toBe("error");
  });

  it.each([301, 302, 307, 308])(
    "une réponse %i vers un autre hôte est refusée, sans second appel",
    async (status) => {
      const { transport, provider } = bench();
      transport.enqueue({
        kind: "http",
        status,
        headers: { location: "https://evil.example/v1/messages" },
      });
      expect(await rejection(provider.complete(makeRequest()))).toBeInstanceOf(
        LlmProviderUnavailableError,
      );
      expect(transport.calls()).toBe(1);
    },
  );

  it("sans transport injecté, utilise globalThis.fetch (qui lève en CI) : aucun réseau", async () => {
    const provider = new AnthropicProvider();
    const error = await rejection(provider.complete(makeRequest()));
    expect(error).toBeInstanceOf(LlmProviderUnavailableError);
    expect(error.message).not.toContain("fetch global interdit");
  });

  it("lit globalThis.fetch à chaque appel, pas à la construction", async () => {
    const provider = new AnthropicProvider();
    const spy = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    vi.stubGlobal("fetch", spy);
    try {
      await rejection(provider.complete(makeRequest()));
    } finally {
      vi.unstubAllGlobals();
    }
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("la garde du domaine passe en premier : requête forgée -> aucun appel", async () => {
    const { transport, provider } = bench();
    const forged = makeRequest({ prompt: { system: "s", user: "u" } as never });
    expect(await rejection(provider.complete(forged))).toBeInstanceOf(InvalidLlmRequestError);
    expect(transport.calls()).toBe(0);
  });

  it("un seul appel réseau par complete", async () => {
    const { transport, provider } = bench();
    transport.enqueue({ kind: "message", text: "a" }, { kind: "message", text: "b" });
    await provider.complete(makeRequest());
    expect(transport.calls()).toBe(1);
  });

  it("est sans état : deux appels indépendants, mêmes requêtes", async () => {
    const { transport, provider } = bench();
    transport.enqueue({ kind: "message", text: "a" }, { kind: "message", text: "a" });
    await provider.complete(makeRequest());
    await provider.complete(makeRequest());
    expect(transport.requests[0]?.rawBody).toBe(transport.requests[1]?.rawBody);
  });

  it("identifie le fournisseur anthropic", () => {
    expect(new AnthropicProvider().id).toBe("anthropic");
  });
});
