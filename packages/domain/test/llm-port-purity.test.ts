import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** TK-50b : les fichiers du port sont purs (imports relatifs, ni horloge, ni aléa, ni I/O). */
const srcDir = resolve(import.meta.dirname, "..", "src");
const FILES = [
  "llm-budget.ts",
  "llm-credential.ts",
  "llm-provider.ts",
  "llm-provider-errors.ts",
  "llm-provider-id.ts",
  "llm-request.ts",
  "llm-errors.ts",
  "llm-output.ts",
  "llm-prompt.ts",
  "untrusted.ts",
  "trusted.ts",
];
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
];
const codeOf = (file: string) =>
  readFileSync(resolve(srcDir, file), "utf8")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/**"));
    })
    .join("\n");

describe("pureté du port LLM", () => {
  it.each(FILES)("%s : imports relatifs seulement", (file) => {
    for (const spec of importsOf(readFileSync(resolve(srcDir, file), "utf8"))) {
      expect(spec.startsWith("./"), `${file} importe « ${spec} »`).toBe(true);
    }
  });

  it.each(FILES)("%s : ni horloge, ni aléa, ni I/O, ni module node", (file) => {
    const code = codeOf(file);
    for (const pattern of FORBIDDEN) {
      expect(pattern.test(code), `${file} contient ${pattern}`).toBe(false);
    }
  });

  it.each(FILES)("%s : au plus 300 lignes", (file) => {
    expect(readFileSync(resolve(srcDir, file), "utf8").split("\n").length).toBeLessThanOrEqual(300);
  });
});
