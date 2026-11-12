import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { contract } from "@koklo/contract";
import { LLM_PROVIDER_IDS } from "@koklo/domain";
import { FakeLlm } from "@koklo/domain/testing";
import { AiProviderRouter, SdkLlmProvider } from "@koklo/llm";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AI_ADAPTERS, AI_CATALOG, AI_PROVIDER } from "../src/ai/ai-tokens.ts";
import { AppModule } from "../src/app.module.ts";
import { configFor, UNREACHABLE_DATABASE_URL } from "./helpers/app.ts";

/**
 * TK-95 D : câblage du moteur `AI_PROVIDER` (jeton qui remplace `LLM_PROVIDERS`), retrait des fuites de
 * fournisseur codé en dur dans l'api, et gardes sur les clés d'organisation (critère « inaccessible à un
 * agent de code »). Aucun réseau, aucune base.
 */
const API = resolve(import.meta.dirname, "..");
const ROOT = resolve(API, "../..");

const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const files = (dir: string, suffix = ".ts"): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? files(join(dir, entry.name), suffix)
          : entry.name.endsWith(suffix)
            ? [join(dir, entry.name)]
            : [],
      )
    : [];

async function resolved(appEnv: "development" | "test" | "staging" | "production") {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(configFor({ databaseUrl: UNREACHABLE_DATABASE_URL, appEnv }))],
  }).compile();
  try {
    return {
      engine: moduleRef.get(AI_PROVIDER, { strict: false }),
      adapters: moduleRef.get(AI_ADAPTERS, { strict: false }),
      catalog: moduleRef.get(AI_CATALOG, { strict: false }),
    };
  } finally {
    await moduleRef.close();
  }
}

describe("câblage de production du moteur", () => {
  it.each(["development", "test", "staging", "production"] as const)(
    "%s : AI_PROVIDER est le moteur, les adaptateurs sont ceux du SDK, jamais le faux",
    async (appEnv) => {
      const { engine, adapters } = await resolved(appEnv);

      expect(engine).toBeInstanceOf(AiProviderRouter);
      for (const id of LLM_PROVIDER_IDS) {
        const adapter = adapters(id);
        expect(adapter).toBeInstanceOf(SdkLlmProvider);
        expect(adapter).not.toBeInstanceOf(FakeLlm);
        expect(adapter.id).toBe(id);
      }
    },
  );

  it("un seul adaptateur par fournisseur (réutilisé d'un appel à l'autre)", async () => {
    const { adapters } = await resolved("test");
    expect(adapters("openai")).toBe(adapters("openai"));
    expect(adapters("openai")).not.toBe(adapters("mistral"));
  });

  it("catalogue de lancement : Anthropic Sonnet seul, pour les quatre usages (A4)", async () => {
    const { catalog } = await resolved("production");
    expect(catalog.list()).toHaveLength(1);
    expect(catalog.list()[0]).toMatchObject({ provider: "anthropic", model: "claude-sonnet-5-5" });
    expect(catalog.list()[0]?.usages).toHaveLength(4);
  });
});

describe("retrait des fuites de fournisseur codé en dur", () => {
  it("l'ancien registre n'existe plus : ni src/llm, ni LLM_PROVIDERS", () => {
    expect(existsSync(join(API, "src/llm"))).toBe(false);
    for (const file of files(join(API, "src"))) {
      expect(readFileSync(file, "utf8"), relative(API, file)).not.toContain("LLM_PROVIDERS");
    }
  });

  it("aucun fichier de src/ai ne nomme un fournisseur, un modèle ni le modèle par défaut", () => {
    const sources = files(join(API, "src/ai"));
    expect(sources.length).toBeGreaterThanOrEqual(10);
    const named = new RegExp(`["'\`](${LLM_PROVIDER_IDS.join("|")})["'\`]|claude-|ANTHROPIC_`);
    for (const file of sources) {
      expect(strip(readFileSync(file, "utf8")), relative(API, file)).not.toMatch(named);
    }
  });

  it("l'exécuteur d'appels ne porte ni table de modèles ni fournisseur imposé", () => {
    const code = strip(readFileSync(join(API, "src/ai/ai-call.ts"), "utf8"));
    expect(code).not.toMatch(/DEFAULT_MODELS|PROPOSAL_PROVIDER|LlmProviderRegistry/);
    const service = strip(readFileSync(join(API, "src/ai/ai.service.ts"), "utf8"));
    expect(service).not.toMatch(/PROPOSAL_PROVIDER/);
    expect(service.match(/usage: "spec_deliverables"/g)).toHaveLength(2);
  });
});

type ContractLeaf = { "~orpc": { meta: { "~openapi"?: { path?: string } } } };

const isAgentRoute = (name: string, leaf: ContractLeaf): boolean => {
  const path = leaf["~orpc"].meta["~openapi"]?.path ?? "";
  const last = name.split(".").at(-1) ?? "";
  return /^\/agent/.test(path) || /^agent/i.test(name) || /^agent/i.test(last);
};

/** Parcours récursif du contrat : un groupe peut contenir des sous-groupes (ex. `idea.page`). */
function collectAgentRoutes(name: string, node: object, found: string[]): void {
  if ("~orpc" in node) {
    if (isAgentRoute(name, node as ContractLeaf)) found.push(name);
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    collectAgentRoutes(name ? `${name}.${key}` : key, child, found);
  }
}

describe("clés d'IA de l'organisation : inaccessibles aux agents de code", () => {
  it("aucun module de packages/delivery n'importe les clés, le résolveur ni @koklo/llm", () => {
    const sources = files(join(ROOT, "packages/delivery/src"));
    expect(sources.length).toBeGreaterThan(10);
    for (const file of sources) {
      expect(strip(readFileSync(file, "utf8")), relative(ROOT, file)).not.toMatch(
        /llm-credential|LlmCredential|@koklo\/llm|AI_PROVIDER|AiCredentialSource/,
      );
    }
  });

  it("le résolveur de clés n'est référencé que par la liste blanche (moteur et service de clés ; la porte de clé du moteur vit désormais dans @koklo/llm)", () => {
    const allowed = [
      "src/ai/ai.module.ts",
      "src/llm-credential/credential-probe.ts",
      "src/llm-credential/llm-credential.module.ts",
      "src/llm-credential/llm-credential.resolver.ts",
    ];
    const using = files(join(API, "src"))
      .filter((file) => /LlmCredentialResolver/.test(readFileSync(file, "utf8")))
      .map((file) => relative(API, file))
      .sort();
    expect(using).toEqual(allowed);
  });

  it("la source de clés du moteur (AiCredentialSource) n'est lue que par le moteur", () => {
    const using = files(join(API, "src"))
      .filter((file) => /PrismaAiCredentialSource/.test(readFileSync(file, "utf8")))
      .map((file) => relative(API, file))
      .sort();
    expect(using).toEqual(["src/ai/ai.module.ts", "src/ai/prisma-ai-credential-source.ts"]);
  });

  it("aucune route à jeton d'agent dans le contrat ; toute route /agent future doit être classée ici", () => {
    const AGENT_ROUTES_CLASSIFIED: string[] = [];
    const found: string[] = [];
    collectAgentRoutes("", contract as unknown as object, found);
    expect(found.sort()).toEqual(AGENT_ROUTES_CLASSIFIED);
  });
});
