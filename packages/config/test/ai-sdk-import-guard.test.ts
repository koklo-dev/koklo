import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  findForbiddenSdkDependencies,
  findForbiddenSdkImports,
} from "../src/forbidden-sdk-imports.ts";

/**
 * TK-95 : les SDK d'IA (Vercel AI SDK, adaptateurs, SDK Anthropic) ne vivent que dans `packages/llm`.
 * Aucun autre paquet ni application ne les déclare ni ne les importe.
 */
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const SOURCE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const SKIPPED = new Set(["node_modules", "dist", ".next", ".turbo", "coverage", "generated"]);
const OWNER = "packages/llm";

const workspaces = (): string[] =>
  ["apps", "packages"]
    .flatMap((group) => readdirSync(join(repoRoot, group)).map((name) => `${group}/${name}`))
    .concat(["e2e"]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED.has(entry.name)) yield* walk(path);
    } else if (SOURCE.test(entry.name)) yield path;
  }
}

describe("aucun SDK d'IA hors packages/llm", () => {
  it("aucun package.json hors packages/llm ne déclare un SDK d'IA", () => {
    const offenders = workspaces()
      .filter((ws) => ws !== OWNER)
      .flatMap((ws) => {
        const path = join(repoRoot, ws, "package.json");
        if (!statSync(path, { throwIfNoEntry: false })) return [];
        return findForbiddenSdkDependencies(JSON.parse(readFileSync(path, "utf8"))).map(
          (d) => `${ws}:${d}`,
        );
      });
    expect(offenders).toEqual([]);
  });

  it("aucune source hors packages/llm n'importe un SDK d'IA", () => {
    const files = workspaces()
      .filter((ws) => ws !== OWNER)
      .map((ws) => join(repoRoot, ws, "src"))
      .filter((dir) => statSync(dir, { throwIfNoEntry: false })?.isDirectory())
      .flatMap((dir) => [...walk(dir)]);
    expect(files.length).toBeGreaterThan(50);
    const offenders = files
      .filter((file) => findForbiddenSdkImports(readFileSync(file, "utf8")).length > 0)
      .map((file) => relative(repoRoot, file));
    expect(offenders).toEqual([]);
  });

  it("packages/llm déclare bien les sept paquets (la garde ne regarde pas dans le vide)", () => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, OWNER, "package.json"), "utf8"));
    expect(findForbiddenSdkDependencies(manifest)).toHaveLength(7);
  });
});

describe("détecteur d'imports de SDK d'IA", () => {
  it.each([
    ['import { generateText } from "ai";', "ai"],
    ["import { generateText } from 'ai';", "ai"],
    ['import { createOpenAI } from "@ai-sdk/openai";', "@ai-sdk/openai"],
    ['import type { X } from "@ai-sdk/provider-utils";', "@ai-sdk/provider-utils"],
    ['export * from "@openrouter/ai-sdk-provider";', "@openrouter/ai-sdk-provider"],
    ['import Anthropic from "@anthropic-ai/sdk";', "@anthropic-ai/sdk"],
    ['const m = await import("ai");', "ai"],
    ['const m = require("@ai-sdk/google");', "@ai-sdk/google"],
    ['import "ai";', "ai"],
    ['import { x } from "ai/test";', "ai/test"],
    ['import {\n  x,\n} from\n  "@ai-sdk/mistral";', "@ai-sdk/mistral"],
  ])("détecte %j", (source, specifier) => {
    expect(findForbiddenSdkImports(source)).toEqual([specifier]);
  });

  it.each([
    'import { x } from "./ai";',
    'import { x } from "../ai/ai.service.ts";',
    'import { x } from "@koklo/ai";',
    'import { x } from "air";',
    '// import { x } from "ai";',
    'const doc = "voir ai et @ai-sdk/openai";',
  ])("ignore %j", (source) => {
    expect(findForbiddenSdkImports(source)).toEqual([]);
  });

  it("détecte la dépendance dans dependencies, devDependencies, peerDependencies et optionalDependencies", () => {
    expect(
      findForbiddenSdkDependencies({
        dependencies: { ai: "7.0.163" },
        devDependencies: { "@ai-sdk/openai": "1" },
        peerDependencies: { "@openrouter/ai-sdk-provider": "1" },
        optionalDependencies: { "@anthropic-ai/sdk": "1" },
      }).sort(),
    ).toEqual(["@ai-sdk/openai", "@anthropic-ai/sdk", "@openrouter/ai-sdk-provider", "ai"]);
    expect(
      findForbiddenSdkDependencies({ dependencies: { airtable: "1", "ai-utils": "1" } }),
    ).toEqual([]);
  });
});
