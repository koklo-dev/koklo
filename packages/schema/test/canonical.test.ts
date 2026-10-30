import { describe, expect, it } from "vitest";
import { CanonicalizeError, canonicalize, checkSpec, parseSpecFiles } from "../src/index.ts";
import { seeded, validFiles } from "./helpers.ts";

describe("CA3 sérialisation canonique", () => {
  it("trie les clés à tous les niveaux, indente de 2 espaces, termine par un unique \\n", () => {
    expect(canonicalize({ b: 1, a: { d: [3, 2], c: null } })).toBe(
      '{\n  "a": {\n    "c": null,\n    "d": [\n      3,\n      2\n    ]\n  },\n  "b": 1\n}\n',
    );
  });

  it("conserve l'ordre des tableaux", () => {
    expect(JSON.parse(canonicalize({ l: ["z", "a", "m"] })).l).toEqual(["z", "a", "m"]);
  });

  it("ordre des unités de code UTF-16, indépendant de la locale", () => {
    const out = canonicalize({ z: 1, é: 2, Z: 3, "\u{1F600}": 4, "～": 5, a: 6 });
    // \u{1F600} commence par la paire de substitution D83D, inférieure à U+FF5E en UTF-16.
    expect(Object.keys(JSON.parse(out))).toEqual(["Z", "a", "z", "é", "\u{1F600}", "～"]);
  });

  it("laisse intacts les caractères non ASCII, sans échappement superflu", () => {
    const out = canonicalize({ titre: "Créer mon compte « ok » 🎉" });
    expect(out).toContain("Créer mon compte « ok » 🎉");
    expect(out).not.toContain("\\u");
  });

  it("n'a ni BOM, ni espace en fin de ligne, ni retour chariot, ni double \\n final", () => {
    const out = canonicalize({ a: [1, { b: [] }, {}], c: "x" });
    expect(out.charCodeAt(0)).not.toBe(0xfeff);
    expect(out).not.toMatch(/[ \t]\n/);
    expect(out).not.toContain("\r");
    expect(out.endsWith("}\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });

  it("sérialise {} et [] sur une ligne, et accepte les valeurs scalaires racines", () => {
    expect(canonicalize({})).toBe("{}\n");
    expect(canonicalize([])).toBe("[]\n");
    expect(canonicalize(null)).toBe("null\n");
    expect(canonicalize("é")).toBe('"é"\n');
  });

  it("omet une propriété valant undefined", () => {
    expect(canonicalize({ a: undefined, b: 1 })).toBe('{\n  "b": 1\n}\n');
  });

  it("deux objets égaux construits dans un autre ordre donnent la même chaîne", () => {
    expect(canonicalize({ a: 1, b: { x: 1, y: 2 } })).toBe(
      canonicalize({ b: { y: 2, x: 1 }, a: 1 }),
    );
  });

  it("ne mute pas l'entrée gelée", () => {
    const frozen = Object.freeze({ b: Object.freeze([1]), a: 1 });
    expect(() => canonicalize(frozen)).not.toThrow();
  });

  describe("erreurs typées", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    const bad: [string, unknown][] = [
      ["NaN", { a: Number.NaN }],
      ["Infinity", { a: Number.POSITIVE_INFINITY }],
      ["-Infinity", [Number.NEGATIVE_INFINITY]],
      ["BigInt", { a: 1n }],
      ["fonction", { a: () => 1 }],
      ["symbole", { a: Symbol("s") }],
      ["Date", { a: new Date(0) }],
      ["Map", { a: new Map() }],
      ["instance de classe", { a: new (class Foo {})() }],
      ["référence circulaire", circular],
      ["undefined dans un tableau", [1, undefined]],
      ["undefined racine", undefined],
    ];
    it.each(bad)("rejette %s par une CanonicalizeError", (_name, value) => {
      expect(() => canonicalize(value)).toThrow(CanonicalizeError);
    });

    it("la CanonicalizeError localise la valeur fautive par un pointeur JSON", () => {
      try {
        canonicalize({ a: [1, { b: Number.NaN }] });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(CanonicalizeError);
        expect((error as CanonicalizeError).path).toBe("/a/1/b");
        expect((error as CanonicalizeError).name).toBe("CanonicalizeError");
      }
    });
  });

  describe("double écriture : écrire, relire, réécrire est identique octet pour octet", () => {
    const roundTrip = (value: unknown) => {
      const first = canonicalize(value);
      const second = canonicalize(JSON.parse(first));
      expect(Buffer.from(second, "utf8").equals(Buffer.from(first, "utf8"))).toBe(true);
      expect(canonicalize(JSON.parse(second))).toBe(first);
    };

    it("pour chaque entité parsée de la fixture valide", () => {
      const { spec } = parseSpecFiles(validFiles());
      const values = [
        spec.project?.value,
        ...spec.features.map((e) => e.value),
        ...spec.tables.map((e) => e.value),
        ...spec.relations.map((e) => e.value),
        ...spec.endpoints.map((e) => e.value),
        ...spec.screens.map((e) => e.value),
        ...spec.tests.map((e) => e.value),
      ];
      expect(values.length).toBeGreaterThanOrEqual(8);
      for (const value of values) roundTrip(value);
    });

    it("pour le rapport de validation", () => {
      roundTrip(checkSpec(validFiles()));
    });

    it("pour des objets générés (graine fixe)", () => {
      const rand = seeded(20261030);
      const alphabet = ["a", "B", "é", "z", "_", "\u{1F600}", "0", "~"];
      const key = () =>
        Array.from(
          { length: 1 + Math.floor(rand() * 4) },
          () => alphabet[Math.floor(rand() * alphabet.length)],
        ).join("");
      const gen = (depth: number): unknown => {
        const r = rand();
        if (depth === 0 || r < 0.3)
          return [null, true, false, 0, -1.5, 1e21, 'x\n"é"', ""][Math.floor(rand() * 8)];
        if (r < 0.65) return Array.from({ length: Math.floor(rand() * 4) }, () => gen(depth - 1));
        return Object.fromEntries(
          Array.from({ length: Math.floor(rand() * 5) }, () => [key(), gen(depth - 1)]),
        );
      };
      for (let i = 0; i < 200; i++) roundTrip(gen(4));
    });

    it("écrire deux fois la même entité ne produit aucun diff", () => {
      const value = { z: [{ b: 1, a: 2 }], a: "é" };
      expect(canonicalize(value)).toBe(canonicalize(structuredClone(value)));
    });
  });
});
