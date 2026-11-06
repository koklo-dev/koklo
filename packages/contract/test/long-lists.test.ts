import { describe, expect, it } from "vitest";
import { z } from "zod";
import { listInputSchema, listOf, pageNumberInputSchema, pageNumberOf } from "../src/index.ts";
import { INSTANT, UUID } from "./support.ts";

/**
 * TK-94 : schémas de liste longue du contrat 1.0.0 (passation 07 §3). `listInputSchema` et `listOf`
 * servent le curseur (schéma 1.1), `pageNumberInputSchema` et `pageNumberOf` le décalage (1.2).
 */
/** Schéma d'élément minimal pour exercer `listOf` / `pageNumberOf`. */
const itemSchema = z.object({ id: z.uuid(), at: z.iso.datetime() });

const accepts = (schema: { safeParse(v: unknown): { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe("L1 listInputSchema (curseur, schéma 1.1)", () => {
  it("accepte une entrée vide, q, cursor, limit 1..100 et around", () => {
    expect(accepts(listInputSchema, {})).toBe(true);
    expect(accepts(listInputSchema, { q: "annulation groupée", limit: 100 })).toBe(true);
    expect(accepts(listInputSchema, { cursor: "c", limit: 1 })).toBe(true);
    expect(accepts(listInputSchema, { around: "F-187" })).toBe(true);
  });

  it("refuse limit 0 et 101, q vide ou de plus de 200 caractères", () => {
    for (const limit of [0, 101, -1, 1.5]) {
      expect(accepts(listInputSchema, { limit }), String(limit)).toBe(false);
    }
    expect(accepts(listInputSchema, { q: "" })).toBe(false);
    expect(accepts(listInputSchema, { q: "x".repeat(201) })).toBe(false);
    expect(accepts(listInputSchema, { q: "x".repeat(200) })).toBe(true);
  });

  it("refuse around et cursor ensemble", () => {
    expect(accepts(listInputSchema, { around: "F-187", cursor: "c" })).toBe(false);
  });

  it("limit arrive en chaîne dans une requête GET : coercition en entier", () => {
    expect(listInputSchema.parse({ limit: "30" }).limit).toBe(30);
  });

  it("ne fixe pas de valeur par défaut (le défaut de 50 est celui du serveur, visible dans l'OpenAPI)", () => {
    expect(listInputSchema.parse({}).limit).toBeUndefined();
  });
});

describe("L2 listOf (sortie curseur)", () => {
  const out = listOf(itemSchema);
  const base = { items: [], nextCursor: null, previousCursor: null, offset: 0, total: 0 };

  it("exige items, nextCursor, previousCursor, offset et total", () => {
    expect(accepts(out, base)).toBe(true);
    for (const field of ["items", "nextCursor", "previousCursor", "offset", "total"]) {
      expect(accepts(out, { ...base, [field]: undefined }), field).toBe(false);
    }
  });

  it("total et offset sont des entiers >= 0", () => {
    for (const total of [-1, 1.5, "3"]) {
      expect(accepts(out, { ...base, total }), String(total)).toBe(false);
    }
    expect(accepts(out, { ...base, offset: -1 })).toBe(false);
    expect(accepts(out, { ...base, total: 1000, offset: 950 })).toBe(true);
  });

  it("facets est facultatif : dimension -> valeur -> compte entier >= 0", () => {
    expect(accepts(out, { ...base, facets: { status: { todo: 3, done: 0 } } })).toBe(true);
    expect(accepts(out, { ...base, facets: { status: { todo: -1 } } })).toBe(false);
    expect(accepts(out, { ...base, facets: { status: { todo: 1.5 } } })).toBe(false);
    expect(accepts(out, { ...base, facets: { status: 3 } })).toBe(false);
  });

  it("valide chaque élément avec le schéma fourni", () => {
    expect(accepts(out, { ...base, items: [{ id: UUID, at: INSTANT }], total: 1 })).toBe(true);
    expect(accepts(out, { ...base, items: [{ id: "x", at: INSTANT }], total: 1 })).toBe(false);
  });
});

describe("L3 pageNumberInputSchema (décalage, schéma 1.2)", () => {
  it("accepte page >= 1 et size 25, 50 ou 100", () => {
    for (const size of [25, 50, 100]) {
      expect(accepts(pageNumberInputSchema, { page: 1, size }), String(size)).toBe(true);
    }
    expect(accepts(pageNumberInputSchema, { q: "x", page: 19, size: 25 })).toBe(true);
  });

  it("refuse size 30, page 0, page décimale et champs manquants", () => {
    expect(accepts(pageNumberInputSchema, { page: 1, size: 30 })).toBe(false);
    expect(accepts(pageNumberInputSchema, { page: 0, size: 25 })).toBe(false);
    expect(accepts(pageNumberInputSchema, { page: 1.5, size: 25 })).toBe(false);
    expect(accepts(pageNumberInputSchema, { size: 25 })).toBe(false);
    expect(accepts(pageNumberInputSchema, { page: 1 })).toBe(false);
  });

  it("page et size arrivent en chaîne dans une requête GET : coercition", () => {
    expect(pageNumberInputSchema.parse({ page: "3", size: "50" })).toMatchObject({
      page: 3,
      size: 50,
    });
  });
});

describe("L4 pageNumberOf (sortie par décalage)", () => {
  const out = pageNumberOf(itemSchema);
  it("porte items, total et totalIsEstimate", () => {
    expect(accepts(out, { items: [], total: 1240, totalIsEstimate: false })).toBe(true);
    expect(accepts(out, { items: [], total: 12000, totalIsEstimate: true })).toBe(true);
    expect(accepts(out, { items: [], total: 12 })).toBe(false);
    expect(accepts(out, { items: [], totalIsEstimate: false })).toBe(false);
    expect(accepts(out, { items: [], total: -1, totalIsEstimate: false })).toBe(false);
  });
});
