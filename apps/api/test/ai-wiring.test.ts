import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { FakeLlm } from "@koklo/domain/testing";
import { ANTHROPIC_MESSAGES_URL, AnthropicProvider } from "@koklo/llm";
import { SimulatedAnthropicTransport } from "@koklo/llm/testing";
import { Test } from "@nestjs/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module.ts";
import { loadConfig } from "../src/config.ts";
import { LLM_PROVIDERS, type LlmProviderRegistry } from "../src/llm/tokens.ts";
import {
  aiApi,
  BRIEF_REPLY,
  credentialState,
  installAiBench,
  keyedWorld,
} from "./helpers/ai-bench.ts";
import { configFor, UNREACHABLE_DATABASE_URL } from "./helpers/app.ts";

/**
 * TK-54b : câblage du registre `LLM_PROVIDERS`. Production : l'adaptateur Anthropic seul, choisi
 * par le code (jamais par la configuration) ; le faux n'est sélectionnable par AUCUNE configuration
 * (même règle que le faux git : seuls les tests le placent, par `overrideProvider`). Aucun réseau
 * en test : `fetch` global est remplacé par un transport simulé ou par une fonction qui lève.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });
afterEach(() => vi.unstubAllGlobals());

const ENV = {
  DATABASE_URL: "postgresql://koklo:secret@localhost:5432/koklo",
  BETTER_AUTH_SECRET: "x".repeat(40),
  BETTER_AUTH_URL: "http://localhost:3000",
  GITHUB_CLIENT_ID: "id",
  GITHUB_CLIENT_SECRET: "secret",
};

async function registryOf(appEnv: "development" | "test" | "staging" | "production") {
  const moduleRef = await Test.createTestingModule({
    imports: [
      AppModule.forRoot({ ...configFor({ databaseUrl: UNREACHABLE_DATABASE_URL, appEnv }) }),
    ],
  }).compile();
  try {
    return moduleRef.get<LlmProviderRegistry>(LLM_PROVIDERS, { strict: false });
  } finally {
    await moduleRef.close();
  }
}

describe("registre de production", () => {
  it.each(["development", "test", "staging", "production"] as const)(
    "%s : exactement l'adaptateur Anthropic, jamais le faux",
    async (appEnv) => {
      const registry = await registryOf(appEnv);

      expect([...registry.keys()]).toEqual(["anthropic"]);
      const provider = registry.get("anthropic");
      expect(provider).toBeInstanceOf(AnthropicProvider);
      expect(provider?.id).toBe("anthropic");
      for (const candidate of registry.values()) {
        expect(candidate).not.toBeInstanceOf(FakeLlm);
        expect(candidate.id).not.toBe("fake");
      }
    },
  );

  it("aucune variable d'environnement ne choisit le fournisseur (AI_PROVIDER, LLM_PROVIDER, LLM_PROVIDERS, USE_FAKE_LLM)", () => {
    const config = loadConfig({
      ...ENV,
      AI_PROVIDER: "fake",
      LLM_PROVIDER: "fake",
      LLM_PROVIDERS: "fake",
      USE_FAKE_LLM: "true",
      ANTHROPIC_BASE_URL: "https://evil.test",
      ANTHROPIC_API_KEY: "FAKE-KEY-NOT-REAL-ENV-0901",
    });

    const text = JSON.stringify(config);
    expect(text).not.toContain("fake");
    expect(text).not.toContain("evil.test");
    expect(text).not.toContain("FAKE-KEY-NOT-REAL-ENV");
    expect(
      Object.keys(config).some((key) => /llm|provider|fake/i.test(key) && key !== "githubApp"),
    ).toBe(false);
  });
});

describe("source : le faux et le transport simulé n'entrent pas dans le code de production de l'api", () => {
  const strip = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(join(dir, entry.name))
        : entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
          ? [join(dir, entry.name)]
          : [],
    );

  it("src/llm et src/ai existent, et ne mentionnent ni FakeLlm, ni SimulatedAnthropicTransport, ni un import */testing", () => {
    const sources = ["../src/llm", "../src/ai"].flatMap((dir) =>
      files(resolve(import.meta.dirname, dir)),
    );
    expect(sources.length).toBeGreaterThanOrEqual(4);
    for (const file of sources) {
      const code = strip(readFileSync(file, "utf8"));
      expect(code, file).not.toMatch(/FakeLlm|SimulatedAnthropicTransport|\/testing["'`]/);
    }
  });

  it("le module llm importe l'adaptateur Anthropic de @koklo/llm", () => {
    const code = files(resolve(import.meta.dirname, "../src/llm"))
      .map((file) => strip(readFileSync(file, "utf8")))
      .join("\n");
    expect(code).toMatch(/from "@koklo\/llm"/);
    expect(code).toContain("AnthropicProvider");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("l'adaptateur de production sous un transport simulé (aucun réseau)", () => {
  it("ai.draftBrief de bout en bout : POST sur l'URL fixe, clé en en-tête, aucune autre clé de corps que celles prévues", async () => {
    const b = bench();
    const { world, key } = await keyedWorld(b, { defaultModel: "claude-modele-org" });
    let sentKey: string | undefined;
    const transport = new SimulatedAnthropicTransport({
      onRequest: (headers) => {
        sentKey = headers["x-api-key"];
      },
    });
    transport.enqueue({
      kind: "message",
      text: JSON.stringify(BRIEF_REPLY),
      model: "claude-servi-1",
    });
    vi.stubGlobal("fetch", transport.fetch);
    const app = await b.makeApp({ defaultRegistry: true });

    const res = await aiApi(app, world.actors.dev).draftBrief(world.projectId, {
      idea: "Une idée pour le transport",
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.brief).toEqual(BRIEF_REPLY);
    expect(res.body.meta.model).toBe("claude-servi-1");
    expect(transport.calls()).toBe(1);
    const [request] = transport.requests;
    expect(request?.url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(request?.method).toBe("POST");
    expect(sentKey).toBe(key);
    const body = request?.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "max_tokens",
      "messages",
      "model",
      "output_config",
      "system",
    ]);
    expect(body.model).toBe("claude-modele-org");
    expect(body.max_tokens).toBe(1500);
    expect(JSON.stringify(body.messages)).toContain("Une idée pour le transport");
    expect(JSON.stringify(request?.headers)).not.toContain(key);
  });

  it("un 401 du fournisseur simulé invalide la clé (chemin complet adaptateur -> service)", async () => {
    const b = bench();
    const { world, key } = await keyedWorld(b);
    const transport = new SimulatedAnthropicTransport({ rejectedKeys: [key] });
    vi.stubGlobal("fetch", transport.fetch);
    const app = await b.makeApp({ defaultRegistry: true });

    const res = await aiApi(app, world.actors.dev).draftBrief(world.projectId);

    expect(res.status, JSON.stringify(res.body)).toBe(502);
    expect(res.body.data).toEqual({ reason: "auth" });
    expect(
      (await credentialState(b.database, world.organizationId))?.invalidated_at,
    ).not.toBeNull();
    expect(JSON.stringify(res.body)).not.toContain(key);
  });

  it("verify de bout en bout : un seul appel minimal sur l'URL fixe", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const transport = new SimulatedAnthropicTransport();
    transport.enqueue({ kind: "message", text: "OK", model: "claude-servi-2" });
    vi.stubGlobal("fetch", transport.fetch);
    const app = await b.makeApp({ defaultRegistry: true });

    const res = await aiApi(app, world.actors.owner).verify();

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.model).toBe("claude-servi-2");
    expect(transport.calls()).toBe(1);
    const sent = transport.requests[0]?.body as { max_tokens: number } | undefined;
    expect(sent?.max_tokens).toBe(16);
  });
});

describe("aucun appel réseau en test", () => {
  it("avec le faux enregistré, le fetch global n'est jamais appelé", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const fetchSpy = vi.fn(() => {
      throw new Error("fetch global interdit en test");
    });
    vi.stubGlobal("fetch", fetchSpy);
    b.use(FakeLlm.replying(BRIEF_REPLY));

    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);

    expect(res.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("avec le registre de production mais sans clé, rien ne part non plus", async () => {
    const b = bench();
    const { createWorld } = await import("./helpers/tickets.ts");
    const world = await createWorld(b.database);
    const fetchSpy = vi.fn(() => {
      throw new Error("fetch global interdit en test");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const app = await b.makeApp({ defaultRegistry: true });

    const res = await aiApi(app, world.actors.dev).draftBrief(world.projectId);

    expect(res.status).toBe(409);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("si le fetch global lève (réseau interdit), l'appel devient LLM_PROVIDER_ERROR unavailable, sans fuite", async () => {
    const b = bench();
    const { world, key } = await keyedWorld(b);
    vi.stubGlobal("fetch", () => {
      throw new Error(`réseau coupé ${key}`);
    });
    const app = await b.makeApp({ defaultRegistry: true });

    const res = await aiApi(app, world.actors.dev).draftBrief(world.projectId);

    expect(res.status).toBe(502);
    expect(res.body.data).toEqual({ reason: "unavailable" });
    expect(JSON.stringify(res.body)).not.toContain(key);
    expect(b.lines.join("\n")).not.toContain(key);
  });
});
