import { describe, expect, it } from "vitest";
import { enforcementSchema, isWeaker, parseCatalog, type Strength } from "../src/index.ts";
import { catalogJson } from "./helpers.ts";

const gate = (params?: Record<string, number | string | boolean>): Strength["enforcement"] => ({
  kind: "gate",
  adapter: "biome",
  ...(params ? { params } : {}),
});
const s = (enforcement: Strength["enforcement"]): Strength => ({
  severity: "blocking",
  enforcement,
});

describe("enforcement.params : schéma", () => {
  it.each([
    ["gate avec max", { kind: "gate", adapter: "biome", params: { max: 50 } }],
    [
      "gate multi-scalaires",
      { kind: "gate", adapter: "x", params: { max: 1, rule: "a/b", on: true } },
    ],
    ["instruction avec max", { kind: "instruction", params: { max: 4 } }],
    ["evidence avec params", { kind: "evidence", evidence: "x", params: { min: 1 } }],
    ["params vide", { kind: "instruction", params: {} }],
  ])("accepte : %s", (_n, value) => {
    expect(enforcementSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ["valeur objet", { kind: "gate", adapter: "x", params: { max: { n: 1 } } }],
    ["valeur tableau", { kind: "gate", adapter: "x", params: { max: [1] } }],
    ["valeur null", { kind: "gate", adapter: "x", params: { max: null } }],
    ["params tableau", { kind: "gate", adapter: "x", params: [1] }],
    ["params texte", { kind: "instruction", params: "max=4" }],
    ["NaN", { kind: "gate", adapter: "x", params: { max: Number.NaN } }],
    ["Infinity", { kind: "gate", adapter: "x", params: { max: Number.POSITIVE_INFINITY } }],
    ["clé inconnue à côté", { kind: "gate", adapter: "x", limit: 3 }],
  ])("rejette : %s", (_n, value) => {
    expect(enforcementSchema.safeParse(value).success).toBe(false);
  });

  it("parseCatalog conserve les params d'une règle", () => {
    const json = catalogJson((c) => {
      (c.rules[1] as Record<string, unknown>).enforcement = {
        kind: "gate",
        adapter: "biome",
        params: { max: 50 },
      };
    });
    const parsed = parseCatalog(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.rules[1]?.enforcement).toEqual({
        kind: "gate",
        adapter: "biome",
        params: { max: 50 },
      });
    }
  });

  it("parseCatalog refuse des params imbriqués avec un code nommé", () => {
    const json = catalogJson((c) => {
      (c.rules[1] as Record<string, unknown>).enforcement = {
        kind: "gate",
        adapter: "biome",
        params: { max: { deep: 1 } },
      };
    });
    const parsed = parseCatalog(json);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.code).toBe("catalog.invalid-shape");
  });
});

describe("isWeaker et limites chiffrées `max` (D3)", () => {
  it.each([
    ["max relevé 50 -> 80", s(gate({ max: 50 })), s(gate({ max: 80 })), true],
    ["max relevé d'une unité", s(gate({ max: 50 })), s(gate({ max: 51 })), true],
    ["max retiré", s(gate({ max: 50 })), s(gate()), true],
    ["params retirés", s(gate({ max: 50, rule: "a" })), s(gate({ rule: "a" })), true],
    ["max abaissé 50 -> 40 (durcir)", s(gate({ max: 50 })), s(gate({ max: 40 })), false],
    ["max identique", s(gate({ max: 50 })), s(gate({ max: 50 })), false],
    ["limite ajoutée (durcir)", s(gate()), s(gate({ max: 50 })), false],
    [
      "instruction : max 4 -> 8",
      s({ kind: "instruction", params: { max: 4 } }),
      s({ kind: "instruction", params: { max: 8 } }),
      true,
    ],
    ["autre param inchangé", s(gate({ rule: "a" })), s(gate({ rule: "b" })), false],
    ["max texte ignoré", s(gate({ max: "a" })), s(gate({ max: "b" })), false],
  ])("%s", (_n, from, to, expected) => {
    expect(isWeaker(from, to)).toBe(expected);
  });
});
