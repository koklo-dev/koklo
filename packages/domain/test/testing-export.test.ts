import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as domain from "../src/index.ts";
import * as testing from "../src/testing/index.ts";

/** TK-50c : sous-chemin `@koklo/domain/testing`, hors de l'API de production, pur comme le reste. */
const root = resolve(import.meta.dirname, "..");
const testingDir = resolve(root, "src", "testing");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const importsOf = (source: string) =>
  [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1] as string);
const FORBIDDEN = [
  /\bDate\b/,
  /\bMath\.random\b/,
  /\bcrypto\b/,
  /\bprocess\b/,
  /\bfetch\s*\(/,
  /\brequire\s*\(/,
  /\bsetTimeout\b|\bsetInterval\b|\bqueueMicrotask\b/,
  /\bperformance\b/,
  /\bconsole\b/,
  /node:/,
  /\bvitest\b/,
];
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/**"));
    })
    .join("\n");

const files = readdirSync(testingDir).filter((f) => f.endsWith(".ts"));

describe("export ./testing", () => {
  it("déclare le sous-chemin ./testing dans package.json (types et default vers dist/testing)", () => {
    expect(pkg.exports["./testing"]).toEqual({
      types: "./dist/testing/index.d.ts",
      default: "./dist/testing/index.js",
    });
    expect(pkg.exports["."]).toEqual({ types: "./dist/index.d.ts", default: "./dist/index.js" });
  });

  it("est compilé par tsconfig.build.json (src entier, sans exclure testing)", () => {
    const build = JSON.parse(readFileSync(resolve(root, "tsconfig.build.json"), "utf8"));
    expect(build.include).toContain("src");
    expect(JSON.stringify(build.exclude)).not.toMatch(/testing/);
  });

  it("exporte le faux, la suite et ses erreurs", () => {
    for (const name of [
      "FakeLlm",
      "FakeLlmScriptExhaustedError",
      "runLlmConformance",
      "llmConformanceCases",
      "LlmConformanceFailure",
      "LLM_CONFORMANCE_CASE_NAMES",
      "LLM_FAILURE_TRIGGERS",
    ]) {
      expect(testing, name).toHaveProperty(name);
    }
  });

  it("garde le faux hors de l'index public de production", () => {
    for (const name of Object.keys(testing)) {
      expect(domain, name).not.toHaveProperty(name);
    }
    expect(readFileSync(resolve(root, "src", "index.ts"), "utf8")).not.toMatch(/testing/);
  });
});

describe("pureté de src/testing", () => {
  it("contient les fichiers attendus", () => {
    expect(files.sort()).toEqual(["fake-llm.ts", "index.ts", "llm-conformance.ts"]);
    expect(existsSync(resolve(testingDir, "fake-llm.ts"))).toBe(true);
  });

  it.each(["fake-llm.ts", "index.ts", "llm-conformance.ts"])(
    "%s : imports relatifs seulement",
    (file) => {
      for (const spec of importsOf(readFileSync(resolve(testingDir, file), "utf8"))) {
        expect(spec.startsWith("./") || spec.startsWith("../"), `${file} importe « ${spec} »`).toBe(
          true,
        );
      }
    },
  );

  it.each(["fake-llm.ts", "index.ts", "llm-conformance.ts"])(
    "%s : ni horloge, ni aléa, ni timer, ni I/O, ni moteur de test",
    (file) => {
      const code = codeOf(resolve(testingDir, file));
      for (const pattern of FORBIDDEN) {
        expect(pattern.test(code), `${file} contient ${pattern}`).toBe(false);
      }
    },
  );

  it.each(["fake-llm.ts", "index.ts", "llm-conformance.ts"])("%s : au plus 300 lignes", (file) => {
    expect(readFileSync(resolve(testingDir, file), "utf8").split("\n").length).toBeLessThanOrEqual(
      300,
    );
  });

  it("le test de pureté racine est étendu : aucun sous-dossier de src n'échappe au contrôle", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(resolve(dir, e.name))
          : e.name.endsWith(".ts")
            ? [resolve(dir, e.name)]
            : [],
      );
    const all = walk(resolve(root, "src"));
    expect(all.length).toBeGreaterThan(files.length);
    for (const file of all) {
      for (const spec of importsOf(readFileSync(file, "utf8"))) {
        const ok =
          spec.startsWith("./") ||
          spec.startsWith("../") ||
          spec === "@koklo/contract" ||
          spec === "@koklo/config";
        expect(ok, `${file} importe « ${spec} »`).toBe(true);
      }
    }
  });
});
