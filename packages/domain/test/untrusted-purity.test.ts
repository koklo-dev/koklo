import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as domain from "../src/index.ts";

/**
 * TK-50a : les fichiers du marquage sont purs : imports relatifs seulement, aucun I/O, ni horloge
 * ni aléa (le nonce est fourni par l'appelant).
 */
const srcDir = resolve(import.meta.dirname, "..", "src");
const FILES = ["untrusted.ts", "trusted.ts", "llm-prompt.ts", "llm-output.ts", "llm-errors.ts"];
const importsOf = (source: string) =>
  [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1] as string);
const FORBIDDEN = [
  /\bDate\b/,
  /\bMath\.random\b/,
  /\bcrypto\b/,
  /\bprocess\b/,
  /\bfetch\s*\(/,
  /\brequire\s*\(/,
  /\bsetTimeout\b|\bsetInterval\b/,
  /\bperformance\b/,
  /\bconsole\b/,
];
const codeOf = (file: string) =>
  readFileSync(resolve(srcDir, file), "utf8")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/**"));
    })
    .join("\n");

describe("pureté du marquage des données non fiables", () => {
  it.each(FILES)("%s : imports relatifs seulement", (file) => {
    for (const spec of importsOf(readFileSync(resolve(srcDir, file), "utf8"))) {
      expect(spec.startsWith("./"), `${file} importe « ${spec} »`).toBe(true);
    }
  });

  it.each(FILES)("%s : ni horloge, ni aléa, ni I/O", (file) => {
    const code = codeOf(file);
    for (const pattern of FORBIDDEN) {
      expect(pattern.test(code), `${file} contient ${pattern}`).toBe(false);
    }
  });

  it.each(FILES)("%s : au plus 300 lignes", (file) => {
    expect(readFileSync(resolve(srcDir, file), "utf8").split("\n").length).toBeLessThanOrEqual(300);
  });

  it("exporte l'API publique du marquage", () => {
    for (const name of [
      "UNTRUSTED_ORIGINS",
      "Untrusted",
      "revealUntrusted",
      "Trusted",
      "trusted",
      "revealTrusted",
      "UNTRUSTED_DATA_POLICY",
      "FramedPrompt",
      "framePrompt",
      "unvalidated",
      "validateLlmOutput",
      "InvalidUntrustedOriginError",
      "TrustedInterpolationError",
      "InvalidPromptNonceError",
      "UntrustedDelimiterCollisionError",
      "LlmInvalidOutputError",
    ]) {
      expect(domain, name).toHaveProperty(name);
    }
  });
});
