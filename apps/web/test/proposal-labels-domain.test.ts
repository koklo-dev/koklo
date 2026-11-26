import { describe, expect, it } from "vitest";
import { refOf, SAVED_TEXT, savedBreakdown, subtitleOf } from "../src/lib/proposal-labels.ts";
import { countsOf } from "../src/lib/use-proposal-status.ts";
import { pendingByTab } from "../src/lib/use-proposals.ts";
import { fake } from "./support/proposals.tsx";

/** TK-103 lot B : sous-lignes de la relecture (maquette 10 l.535-538), récapitulatif et compteurs par onglet. */
describe("subtitleOf : quatre types", () => {
  it("règle, rôle, parcours et fonctionnalité", () => {
    expect(
      subtitleOf(
        fake(1, { kind: "rule", content: { title: "T", statement: "E", type: "contrainte" } }),
      ),
    ).toBe("Règle · contrainte");
    expect(
      subtitleOf(
        fake(1, { kind: "rule", content: { title: "T", statement: "E", type: "workflow" } }),
      ),
    ).toBe("Règle · workflow à états");
    expect(
      subtitleOf(
        fake(1, {
          kind: "role",
          content: {
            name: "A",
            description: "",
            permissions: [{ id: "PM-a.b" }, { id: "PM-a.c" }, { id: "PM-a.d" }, { id: "PM-a.e" }],
          },
        }),
      ),
    ).toBe("Rôle · 4 permissions");
    expect(
      subtitleOf(
        fake(1, {
          kind: "flow",
          content: { title: "T", start: "Départ", steps: ["a", "b", "c", "d"] },
        }),
      ),
    ).toBe("Parcours · 5 étapes");
    expect(subtitleOf(fake(1))).toMatch(/^Fonctionnalité · /);
  });
});

describe("savedBreakdown", () => {
  it("groupé par onglet quand plusieurs onglets sont concernés, vide sinon", () => {
    expect(savedBreakdown(["feature", "feature", "feature", "rule", "rule", "flow"])).toBe(
      "3 fonctionnalités, 2 règles, 1 parcours",
    );
    expect(savedBreakdown(["feature", "criteria"])).toBe("");
    expect(savedBreakdown(["role"])).toBe("");
  });
});

describe("pendingByTab", () => {
  it("somme les propositions à relire des groupes `type` et `type:zone` par onglet", () => {
    expect(
      pendingByTab([
        { key: "feature:Réservation", pending: 3 },
        { key: "criteria", pending: 2 },
        { key: "rule", pending: 4 },
        { key: "flow:Client", pending: 1 },
      ]),
    ).toEqual({ features: 5, rules: 4, roles: 0, flows: 1 });
  });
});

describe("refOf : rang préfixé selon le type (TK-103 correction 1)", () => {
  it("un rôle sans identifiant ne prend pas le préfixe P- des parcours", () => {
    expect(refOf(fake(5, { kind: "role", content: { name: "A" } }))).toMatch(/^RL-\d{3}$/);
    expect(refOf(fake(5, { kind: "rule", content: { title: "T" } }))).toMatch(/^R-\d{3}$/);
    expect(refOf(fake(5, { kind: "flow", content: { title: "T" } }))).toMatch(/^P-\d{3}$/);
    expect(refOf(fake(5, { kind: "role", content: { specId: "RL-client" } }))).toBe("RL-client");
  });
});

/** TK-114g lot B, cas B2 (B703) : déjà présentes comptées à part, dans le récapitulatif et les comptes du bandeau. */
describe("déjà présente dans la spec", () => {
  it("SAVED_TEXT : « K proposition(s) écartée(s) : déjà présente(s) dans la spec », avant les remises à relire", () => {
    expect(SAVED_TEXT(0, 0, [], 1)).toBe(
      "0 enregistrée dans la spec · 1 proposition écartée : déjà présente dans la spec",
    );
    expect(SAVED_TEXT(2, 0, ["missing"], 2)).toBe(
      "2 enregistrées dans la spec · 2 propositions écartées : déjà présentes dans la spec · 1 remise à relire : n'existe plus dans la spec",
    );
    expect(SAVED_TEXT(2, 0, [], 0)).toBe("2 enregistrées dans la spec");
  });

  it("countsOf : present = somme des alreadyPresent, absent = 0", () => {
    const group = { label: "G", total: 3, accepted: 1, rejected: 0, pending: 1 };
    expect(
      countsOf([
        { ...group, key: "doc_section", alreadyPresent: 1 },
        { ...group, key: "component" },
      ]),
    ).toEqual({ total: 6, accepted: 2, rejected: 0, pending: 2, present: 1 });
  });
});
