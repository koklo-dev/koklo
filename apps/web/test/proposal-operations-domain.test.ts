import { describe, expect, it } from "vitest";
import { isSavable, operationOf } from "../src/lib/proposal-operations.ts";
import { fake } from "./support/proposals.tsx";

/** TK-103 lot B : opérations des propositions `rule`, `role` et `flow` (charges de `proposals/others.ts`). */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("operationOf : rule, role, flow", () => {
  it("rule -> rule.create (titre, énoncé, type par défaut contrainte, exemple, états, fonctionnalités)", () => {
    const op = operationOf(
      fake(1, {
        kind: "rule",
        content: {
          title: " Délai ",
          statement: "Plus de 2 h.",
          type: "workflow",
          example: "14 h",
          states: ["A", "B"],
          features: ["F-001"],
        },
      }),
    );
    expect(op).toEqual({
      kind: "rule.create",
      title: "Délai",
      type: "workflow",
      statement: "Plus de 2 h.",
      examples: ["14 h"],
      states: ["A", "B"],
      features: ["F-001"],
    });
    expect(operationOf(fake(1, { kind: "rule", content: { title: "T", statement: "E" } }))).toEqual(
      { kind: "rule.create", title: "T", type: "contrainte", statement: "E" },
    );
  });

  it("role -> role.create avec permissions et restriction", () => {
    expect(
      operationOf(
        fake(1, {
          kind: "role",
          content: {
            name: "Accueil",
            description: "Gère l'agenda.",
            permissions: [{ id: "PM-agenda.lire", restriction: "les siennes" }, { id: "PM-a.b" }],
          },
        }),
      ),
    ).toEqual({
      kind: "role.create",
      name: "Accueil",
      description: "Gère l'agenda.",
      permissions: [{ id: "PM-agenda.lire", restriction: "les siennes" }, { id: "PM-a.b" }],
    });
  });

  it("flow -> flow.create : étapes en libellés, acteur et départ par défaut, erreurs", () => {
    expect(
      operationOf(
        fake(1, {
          kind: "flow",
          content: {
            title: "Annuler",
            steps: ["Choisir", "Confirmer"],
            actor: "Client",
            start: "Lien du SMS",
            errors: [{ step: 2, text: "refus" }],
            features: ["F-002"],
          },
        }),
      ),
    ).toEqual({
      kind: "flow.create",
      title: "Annuler",
      actor: "Client",
      start: { label: "Lien du SMS" },
      steps: [{ label: "Choisir" }, { label: "Confirmer" }],
      errors: [{ step: 2, text: "refus" }],
      features: ["F-002"],
    });
    const bare = operationOf(
      fake(1, { kind: "flow", content: { title: "T", steps: ["Un", "Deux"] } }),
    );
    expect(bare).toMatchObject({
      actor: "Client",
      start: { label: "Un" },
      steps: [{ label: "Deux" }],
    });
  });

  it("un rôle ou un parcours accepté est enregistrable", () => {
    expect(
      isSavable(
        fake(1, { kind: "role", status: "accepted", content: { name: "A", description: "" } }),
      ),
    ).toBe(true);
  });
});
