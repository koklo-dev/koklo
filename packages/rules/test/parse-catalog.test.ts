import { describe, expect, it } from "vitest";
import { CATALOG_ERROR_CODES, MAX_CATALOG_BYTES, parseCatalog } from "../src/index.ts";
import { catalogJson, INVALID_FIXTURES } from "./helpers.ts";

describe("parseCatalog : fixture valide minimale", () => {
  it("renvoie ok avec le catalogue typé en camelCase", () => {
    const result = parseCatalog(catalogJson());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.schemaVersion).toBe(1);
    expect(result.value.rules).toHaveLength(3);
    expect(result.value.rules[0]?.enforcement).toEqual({ kind: "gate", adapter: "secret-scan" });
  });
  it("ne lève jamais : toute entrée donne un Result", () => {
    for (const input of ["", "null", "42", '"x"', "{}", "[]"]) {
      expect(() => parseCatalog(input)).not.toThrow();
      expect(parseCatalog(input).ok).toBe(false);
    }
  });
  it("est déterministe et sans effet de bord sur l'entrée", () => {
    const json = catalogJson();
    expect(parseCatalog(json)).toEqual(parseCatalog(json));
  });
});

describe("parseCatalog : une fixture invalide par code d'erreur", () => {
  it.each(INVALID_FIXTURES)("$code : $name", ({ code, json, path }) => {
    const result = parseCatalog(json());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(code);
    expect(result.error.message.length).toBeGreaterThan(0);
    if (path !== undefined) expect(result.error.path).toBe(path);
  });

  it("couvre tous les codes sauf catalog.too-large (test dédié)", () => {
    const covered = new Set(INVALID_FIXTURES.map((f) => f.code));
    const missing = CATALOG_ERROR_CODES.filter((c) => c !== "catalog.too-large" && !covered.has(c));
    expect(missing).toEqual([]);
  });
});

describe("parseCatalog : fichier trop gros", () => {
  it("fixe la limite à 1 Mio", () => {
    expect(MAX_CATALOG_BYTES).toBe(1_048_576);
  });
  it("rejette avant tout parsing un document de plus de MAX_CATALOG_BYTES octets", () => {
    const result = parseCatalog(" ".repeat(MAX_CATALOG_BYTES + 1));
    expect(result).toMatchObject({ ok: false, error: { code: "catalog.too-large" } });
  });
  it("compte des octets UTF-8, pas des caractères", () => {
    const big = `"${"é".repeat(MAX_CATALOG_BYTES / 2)}"`;
    expect(parseCatalog(big)).toMatchObject({ ok: false, error: { code: "catalog.too-large" } });
  });
  it("accepte un document de taille exactement MAX_CATALOG_BYTES (autre code d'erreur)", () => {
    const json = ` ${" ".repeat(MAX_CATALOG_BYTES - 3)}{}`;
    expect(Buffer.byteLength(json)).toBe(MAX_CATALOG_BYTES);
    const result = parseCatalog(json);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).not.toBe("catalog.too-large");
  });
});
