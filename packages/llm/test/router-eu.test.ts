import { LlmAuthError } from "@koklo/domain";
import { FakeLlm } from "@koklo/domain/testing";
import { describe, expect, it } from "vitest";
import { AiNotConfiguredError } from "../src/index.ts";
import { rejection } from "./support/harness.ts";
import { bench, REQUEST, throwing } from "./support/router-bench.ts";

const op = { operation: "complete", provider: "anthropic" } as const;

describe("TK-95 B · exclusion d'OpenRouter avec euOnly (A5, lecture prudente)", () => {
  const viaOpenRouter = { idea_space: { provider: "openrouter", model: "a/b" } } as const;

  it("fournisseur d'usage : écarté, on retombe sur le principal", async () => {
    const openrouter = FakeLlm.replying("x");
    const anthropic = FakeLlm.replying("x");
    const { router } = bench({
      providers: { openrouter, anthropic },
      routing: { usageModels: viaOpenRouter },
    });
    const response = await router.complete(REQUEST({ euOnly: true }));
    expect(response.provider).toBe("anthropic");
    expect(openrouter.calls).toHaveLength(0);
  });

  it("sans euOnly, OpenRouter est utilisable comme fournisseur d'usage", async () => {
    const openrouter = FakeLlm.replying("x");
    const { router } = bench({
      providers: { openrouter },
      routing: { usageModels: viaOpenRouter },
    });
    expect((await router.complete(REQUEST())).provider).toBe("openrouter");
  });

  it("principal : écarté, jamais essayé", async () => {
    const openrouter = FakeLlm.replying("x");
    const { router, credentials } = bench({
      providers: { openrouter },
      routing: { primary: "openrouter", fallback: undefined },
    });
    const response = await router.complete(REQUEST({ euOnly: true }));
    expect(response.provider).toBe("anthropic");
    expect(openrouter.calls).toHaveLength(0);
    expect(credentials.resolved).not.toContain("openrouter");
  });

  it("secours : jamais choisi ni essayé, l'erreur d'origine est rendue", async () => {
    const failure = new LlmAuthError(op);
    const openrouter = FakeLlm.replying("x");
    const { router } = bench({
      providers: { anthropic: throwing(failure), openrouter },
      routing: { fallback: "openrouter" },
    });
    expect(await rejection(router.complete(REQUEST({ euOnly: true })))).toBe(failure);
    expect(openrouter.calls).toHaveLength(0);
  });

  it("sans euOnly, OpenRouter est un secours valide", async () => {
    const { router } = bench({
      providers: { anthropic: throwing(new LlmAuthError(op)) },
      routing: { fallback: "openrouter" },
    });
    expect((await router.complete(REQUEST())).provider).toBe("openrouter");
  });

  it("OpenRouter seul et euOnly : non configuré, sans appel", async () => {
    const openrouter = FakeLlm.replying("x");
    const { router } = bench({
      providers: { openrouter },
      keys: ["openrouter"],
      routing: { primary: "openrouter", fallback: undefined, availableProviders: ["openrouter"] },
    });
    const error = await rejection(router.complete(REQUEST({ euOnly: true })));
    expect(error).toBeInstanceOf(AiNotConfiguredError);
    expect((error as AiNotConfiguredError).reason).toBe("eu-restricted");
    expect(openrouter.calls).toHaveLength(0);
  });

  it("le flux respecte la même exclusion", async () => {
    const openrouter = FakeLlm.replying("x");
    const { router } = bench({
      providers: { openrouter },
      routing: { primary: "openrouter" },
    });
    const events = [];
    for await (const event of router.stream(REQUEST({ euOnly: true }))) events.push(event);
    expect(openrouter.calls).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ type: "end", provider: "anthropic" });
  });
});
