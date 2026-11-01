import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCatalog } from "../src/index.ts";
import { readFixture } from "./helpers.ts";

const PROTECTED = [
  "global.secrets",
  "global.dependency-integrity",
  "security.authorization",
  "privacy.sensitive-logging",
];
const PROFILES = [
  "core",
  "node",
  "typescript",
  "php",
  "python",
  "web",
  "api",
  "persistence",
  "security",
  "docker",
  "terraform",
  "ci",
  "privacy-rgpd",
];

const parsed = () => {
  const result = parseCatalog(readFixture("shipyard-catalog.json"));
  if (!result.ok) throw new Error(`${result.error.code} ${result.error.path ?? ""}`);
  return result.value;
};

describe("import du catalogue Shipyard réel (copie versionnée 2026.08.3)", () => {
  it("parse sans erreur", () => {
    expect(parseCatalog(readFixture("shipyard-catalog.json")).ok).toBe(true);
  });
  it("contient 34 règles, 13 profils et 4 ids protégés", () => {
    const c = parsed();
    expect(c.rules).toHaveLength(34);
    expect(Object.keys(c.profiles).sort()).toEqual([...PROFILES].sort());
    expect([...c.protectedRuleIds].sort()).toEqual([...PROTECTED].sort());
    expect(c.catalogVersion).toBe("2026.08.3");
    expect(c.schemaVersion).toBe(1);
  });
  it("les règles protected:true sont exactement les ids protégés, toutes blocking", () => {
    const c = parsed();
    const flagged = c.rules.filter((r) => r.protected);
    expect(flagged.map((r) => r.id).sort()).toEqual([...PROTECTED].sort());
    expect(flagged.every((r) => r.severity === "blocking")).toBe(true);
  });
  it("les trois types d'enforcement sont présents", () => {
    const kinds = new Set(parsed().rules.map((r) => r.enforcement.kind));
    expect([...kinds].sort()).toEqual(["evidence", "gate", "instruction"]);
  });
  it("ids uniques et tous les profils référencés existent", () => {
    const c = parsed();
    const ids = c.rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of c.rules) for (const p of r.profiles) expect(c.profiles).toHaveProperty(p);
  });
  it("est idempotent : deux parsings donnent le même résultat", () => {
    expect(parsed()).toEqual(parsed());
  });
});

const VAULT = "/home/devops/perso/projets/MyVault/koklo-v2/rules/catalog.json";
describe("dérive de la copie de test", () => {
  it.skipIf(!existsSync(VAULT))("la copie versionnée est identique au fichier du vault", () => {
    expect(readFixture("shipyard-catalog.json")).toBe(readFileSync(resolve(VAULT), "utf8"));
  });
});
