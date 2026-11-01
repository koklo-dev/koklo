import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBuiltInCatalog, parseCatalog } from "../src/index.ts";

const root = resolve(import.meta.dirname, "..");

/** D4 (tranchée au lot A) : `tsc` 7 accepte `import x from "./catalog.json" with { type: "json" }`
 *  avec rootDir=src et copie le JSON dans dist : le catalogue est src/catalog.json. */
describe("catalogue livré avec le paquet (D4)", () => {
  it("src/catalog.json existe et est un catalogue valide", () => {
    const file = resolve(root, "src/catalog.json");
    expect(existsSync(file)).toBe(true);
    expect(parseCatalog(readFileSync(file, "utf8")).ok).toBe(true);
  });
  it("loadBuiltInCatalog renvoie le catalogue parsé de src/catalog.json", () => {
    const expected = parseCatalog(readFileSync(resolve(root, "src/catalog.json"), "utf8"));
    expect(expected.ok).toBe(true);
    if (expected.ok) expect(loadBuiltInCatalog()).toEqual(expected.value);
  });
  it("au lot A il reprend les 34 règles du catalogue Shipyard", () => {
    const c = loadBuiltInCatalog();
    expect(c.rules.length).toBeGreaterThanOrEqual(34);
    expect(c.protectedRuleIds).toHaveLength(4);
  });
  it("renvoie un résultat identique à chaque appel", () => {
    expect(loadBuiltInCatalog()).toEqual(loadBuiltInCatalog());
  });
  it("le module source importe le JSON avec l'attribut de type", () => {
    const src = readFileSync(resolve(root, "src/builtin-catalog.ts"), "utf8");
    expect(src).toMatch(/from\s+"\.\/catalog\.json"\s+with\s*\{\s*type:\s*"json"\s*\}/);
  });
});
