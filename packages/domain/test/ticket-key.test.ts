import { describe, expect, it } from "vitest";
import {
  assertUniqueKeys,
  DuplicateTicketKeyError,
  formatTicketKey,
  InvalidTicketKeyError,
  nextTicketKey,
  parseTicketKey,
} from "../src/index.ts";

describe("K1 format et analyse", () => {
  it("formatTicketKey(45) donne TK-45 et parseTicketKey le relit", () => {
    expect(formatTicketKey(45)).toBe("TK-45");
    expect(parseTicketKey("TK-45")).toBe(45);
    expect(parseTicketKey(formatTicketKey(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("formatTicketKey refuse 0, négatifs, non entiers, hors plage sûre", () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => formatTicketKey(bad)).toThrow(InvalidTicketKeyError);
    }
  });
});

describe("K2 refus de clés mal formées", () => {
  const bad: unknown[] = [
    "TK-0",
    "TK-",
    "TK-01",
    "tk-5",
    "TK-5 ",
    " TK-5",
    "TK-5a",
    "TK--1",
    "TK-1.5",
    `TK-${Number.MAX_SAFE_INTEGER + 1}`,
    "TK-99999999999999999999",
    "PR-5",
    "",
    5,
    null,
    undefined,
  ];
  it.each(bad.map((v) => [JSON.stringify(v) ?? "undefined", v] as const))(
    "refuse %s",
    (_label, value) => {
      expect(() => parseTicketKey(value)).toThrow(InvalidTicketKeyError);
    },
  );

  it("porte la valeur refusée dans l'erreur", () => {
    expect(() => parseTicketKey("TK-01")).toThrow(expect.objectContaining({ value: "TK-01" }));
  });
});

describe("K3 générateur à partir d'un compteur", () => {
  it("est pur et strictement croissant", () => {
    expect(nextTicketKey(0)).toBe("TK-1");
    expect(nextTicketKey(24)).toBe("TK-25");
    expect(nextTicketKey(24)).toBe(nextTicketKey(24));
    const keys = [0, 1, 2, 3].map(nextTicketKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.map(parseTicketKey)).toEqual([1, 2, 3, 4]);
  });

  it("refuse un compteur négatif, non entier ou hors plage sûre", () => {
    for (const bad of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER, 2 ** 60, "3" as never]) {
      expect(() => nextTicketKey(bad)).toThrow(InvalidTicketKeyError);
    }
  });
});

describe("K4 unicité par projet", () => {
  it("accepte un ensemble sans doublon, et le même ensemble dans un autre projet", () => {
    expect(() => assertUniqueKeys(["TK-1", "TK-2"])).not.toThrow();
    expect(() => assertUniqueKeys([])).not.toThrow();
    expect(() => assertUniqueKeys(["TK-1", "TK-2"])).not.toThrow();
  });

  it("refuse un doublon avec DuplicateTicketKeyError portant la clé", () => {
    expect(() => assertUniqueKeys(["TK-1", "TK-2", "TK-1"])).toThrow(DuplicateTicketKeyError);
    expect(() => assertUniqueKeys(["TK-1", "TK-2", "TK-1"])).toThrow(
      expect.objectContaining({ key: "TK-1" }),
    );
  });

  it("refuse une clé mal formée dans l'ensemble", () => {
    expect(() => assertUniqueKeys(["TK-1", "oops"])).toThrow(InvalidTicketKeyError);
  });
});
