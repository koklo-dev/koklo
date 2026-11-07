import { InvalidLlmRequestError } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { rejection } from "./support/harness.ts";
import { providerFor, requestFor, scripted } from "./support/sdk-bench.ts";
import { COMPAT_BASE_URL, okResponse } from "./support/sdk-bodies.ts";

const reasonOf = async (call: Promise<unknown>) => {
  const error = await rejection(call);
  expect(error).toBeInstanceOf(InvalidLlmRequestError);
  return (error as InvalidLlmRequestError).reason;
};

describe("baseUrl à l'appel (anti-SSRF)", () => {
  it("openai_compatible : l'adresse de la requête est celle qui est appelée", async () => {
    const t = scripted(() => okResponse("openai", "ok"));
    await providerFor("openai_compatible", t.fetch).complete(requestFor("openai_compatible"));
    expect(t.calls[0]?.url).toBe(`${COMPAT_BASE_URL}/chat/completions`);
  });

  it("absente pour openai_compatible, présente pour un autre fournisseur : refusée", async () => {
    const t = scripted(() => okResponse("openai", "ok"));
    expect(
      await reasonOf(
        providerFor("openai_compatible", t.fetch).complete(
          requestFor("openai_compatible", { baseUrl: undefined }),
        ),
      ),
    ).toBe("baseUrl");
    expect(
      await reasonOf(
        providerFor("openai", t.fetch).complete(requestFor("openai", { baseUrl: COMPAT_BASE_URL })),
      ),
    ).toBe("baseUrl");
    expect(t.calls).toHaveLength(0);
  });

  it.each([
    "http://llm.exemple.test/v1",
    "https://user:pass@llm.exemple.test/v1",
    "https://llm.exemple.test:8443/v1",
    "https://localhost/v1",
    "https://api.localhost/v1",
    "https://base.local/v1",
    "https://base.internal/v1",
    "https://127.0.0.1/v1",
    "https://10.0.0.5/v1",
    "https://169.254.169.254/latest",
    "https://0.0.0.0/v1",
    "https://2130706433/v1",
    "https://0x7f.1/v1",
    "https://017700000001/v1",
    "https://[::1]/v1",
    "https://[::ffff:127.0.0.1]/v1",
    "https://[fd00::1]/v1",
    "pas une url",
    "ftp://llm.exemple.test/v1",
  ])("refuse %s sans aucun appel réseau", async (baseUrl) => {
    const t = scripted(() => okResponse("openai", "ok"));
    expect(
      await reasonOf(
        providerFor("openai_compatible", t.fetch).complete(
          requestFor("openai_compatible", { baseUrl }),
        ),
      ),
    ).toBe("baseUrl");
    expect(t.calls).toHaveLength(0);
  });

  it("refuse un nom qui résout vers une adresse privée (anti-rebond DNS), à chaque appel", async () => {
    const t = scripted(
      () => okResponse("openai", "ok"),
      () => okResponse("openai", "ok"),
    );
    let answer: readonly string[] = ["93.184.216.34"];
    const provider = providerFor("openai_compatible", t.fetch, { resolveHost: async () => answer });
    await provider.complete(requestFor("openai_compatible"));
    answer = ["93.184.216.34", "10.1.2.3"];
    expect(await reasonOf(provider.complete(requestFor("openai_compatible")))).toBe("baseUrl");
    answer = [];
    expect(await reasonOf(provider.complete(requestFor("openai_compatible")))).toBe("baseUrl");
    expect(t.calls).toHaveLength(1);
  });

  it("http://127.0.0.1 n'est accepté que par l'option injectée par le code (jamais par l'environnement)", async () => {
    process.env.KOKLO_LLM_ALLOW_LOOPBACK = "1";
    try {
      const t = scripted(() => okResponse("openai", "ok"));
      const request = requestFor("openai_compatible", { baseUrl: "http://127.0.0.1:4010/v1" });
      expect(await reasonOf(providerFor("openai_compatible", t.fetch).complete(request))).toBe(
        "baseUrl",
      );
      const open = providerFor("openai_compatible", t.fetch, {
        allowInsecureLoopbackForTests: true,
      });
      await open.complete(request);
      expect(t.calls[0]?.url).toBe("http://127.0.0.1:4010/v1/chat/completions");
    } finally {
      delete process.env.KOKLO_LLM_ALLOW_LOOPBACK;
    }
  });
});
