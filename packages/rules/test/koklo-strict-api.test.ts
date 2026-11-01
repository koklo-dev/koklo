import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as rules from "../src/index.ts";

const root = resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("API publique du lot C", () => {
  it("exporte profil, verrouillage, dérive Biome et preuves", () => {
    for (const name of [
      "kokloStrictProfile",
      "KOKLO_STRICT_PROFILE_ID",
      "withKokloStrict",
      "checkBiomeLimits",
      "validateEvidence",
      "VERDICTS",
      "VERDICT_REASONS",
      "EVIDENCE_ERROR_CODES",
    ]) {
      expect(rules, name).toHaveProperty(name);
    }
  });

  it("un fichier source par export principal, en kebab-case", () => {
    for (const file of [
      "koklo-strict.ts",
      "with-koklo-strict.ts",
      "biome-drift.ts",
      "validate-evidence.ts",
      "evidence-types.ts",
    ]) {
      expect(existsSync(resolve(root, "src", file)), file).toBe(true);
    }
  });

  it("les fichiers du lot C restent purs (pas de fs, d'horloge ni d'effet)", () => {
    for (const file of [
      "koklo-strict.ts",
      "with-koklo-strict.ts",
      "biome-drift.ts",
      "validate-evidence.ts",
    ]) {
      const text = read(`src/${file}`);
      expect(text, file).not.toMatch(/node:|from\s+"fs"|readFileSync|process\.|Date\.now|new Date/);
    }
  });

  it("aucune dépendance ajoutée : zod seulement", () => {
    expect(Object.keys(JSON.parse(read("package.json")).dependencies)).toEqual(["zod"]);
  });
});

describe("README du lot C", () => {
  const readme = read("README.md");
  it.each([
    "kokloStrictProfile",
    "withKokloStrict",
    "validateEvidence",
    "checkBiomeLimits",
    "UNVERIFIED",
    "koklo-strict",
    "standard",
  ])("documente %s", (term) => {
    expect(readme).toContain(term);
  });
  it("précise que l'activation est explicite et que les verrous D3 existent", () => {
    expect(readme).toMatch(/jamais déduit/);
    expect(readme).toMatch(/strict\.domain-purity/);
    expect(readme).toMatch(/strict\.conventional-commits/);
  });
});
