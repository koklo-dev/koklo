import { describe, expect, it } from "vitest";
import {
  type TechnicalHeaderInput,
  technicalHeaderStateOf,
} from "../src/lib/technical-header-state.ts";

/** TK-115 lot C, cas 11 : états d'en-tête de la page Technique (fiche §11, maquette 14 l.774-815). */
const COUNTS = { choices: 24, operations: 132, requirements: 28, environments: 3, open: 2 };

const input = (over: Partial<TechnicalHeaderInput> = {}): TechnicalHeaderInput => ({
  team: true,
  canWrite: true,
  agent: true,
  reviewing: false,
  generating: false,
  pending: 0,
  viewKind: "list",
  tab: "stack",
  counts: COUNTS,
  deliverable: "pending",
  available: true,
  ...over,
});

const VALIDATION = { name: "Moussa", at: "2026-11-05T10:00:00.000Z", sha: "c07d2b4aaaa" };

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("en-tête de la page Technique", () => {
  it("Liste : validation de l'équipe, résumé, « Valider » bloqué par les choix à trancher", () => {
    const state = technicalHeaderStateOf(input());
    expect(state.statusLabel).toBe("Validation de l'équipe · le client lit et commente");
    expect(state.statusIcon).toBe("groups");
    expect(state.summary).toBe(
      "24 choix · 132 opérations · 28 exigences · 3 environnements · 2 choix à trancher avant de valider",
    );
    expect(state.actions).toEqual(["propose", "create-stack", "validate"]);
    expect(state.validateBlocked).toBe(true);
    expect(state.createPrimary).toBeUndefined();
    expect(state.tabCounts).toEqual({
      stack: { value: 24 },
      api: { value: 132 },
      nfr: { value: 28 },
      environments: { value: 3 },
    });
  });

  it("tous tranchés : le résumé s'arrête aux comptes ; singuliers", () => {
    const counts = { choices: 1, operations: 1, requirements: 1, environments: 1, open: 0 };
    const state = technicalHeaderStateOf(input({ counts }));
    expect(state.summary).toBe("1 choix · 1 opération · 1 exigence · 1 environnement");
    expect(state.validateBlocked).toBeUndefined();
  });

  it("TK-115b : aucun choix de stack : « Valider » bloqué, la raison au résumé", () => {
    const counts = { ...COUNTS, choices: 0, open: 0 };
    const state = technicalHeaderStateOf(input({ counts }));
    expect(state.summary).toBe(
      "0 choix · 132 opérations · 28 exigences · 3 environnements · aucun choix de stack : ajoutez-en un avant de valider",
    );
    expect(state.actions).toContain("validate");
    expect(state.validateBlocked).toBe(true);
  });

  it.each([
    [0, 0, "aucun choix de stack : ajoutez-en un avant de valider"],
    [24, 2, "2 choix à trancher avant de valider"],
  ])(
    "TK-115b : à revoir (%i choix, %i ouverts) : la raison suit la date",
    (choices, open, reason) => {
      const counts = { ...COUNTS, choices, open };
      const state = technicalHeaderStateOf(
        input({ counts, deliverable: "revise", validation: VALIDATION }),
      );
      expect(state.summary).toBe(`Validé le 5 nov., l'architecture a changé depuis · ${reason}`);
      expect(state.validateBlocked).toBe(true);
    },
  );

  it("TK-115b : comptes non lus : « Valider » bloqué, aucune raison inventée", () => {
    const state = technicalHeaderStateOf(
      input({ counts: undefined, deliverable: "revise", validation: VALIDATION }),
    );
    expect(state.summary).toBe("Validé le 5 nov., l'architecture a changé depuis");
    expect(state.validateBlocked).toBe(true);
  });

  it.each([
    ["environments", ["propose", "create-environment", "validate"]],
    ["api", ["propose", "create-operation", "validate"]],
    ["nfr", ["propose", "create-requirement", "validate"]],
    ["document", ["propose", "validate"]],
  ] as const)("l'ajout suit l'onglet : %s", (tab, actions) => {
    expect(technicalHeaderStateOf(input({ tab })).actions).toEqual(actions);
  });

  it("sans agent : ajout puis « Valider » ; lecture en cours : jamais « Valider »", () => {
    expect(technicalHeaderStateOf(input({ agent: false })).actions).toEqual([
      "create-stack",
      "validate",
    ]);
    expect(technicalHeaderStateOf(input({ viewKind: "loading" })).actions).toEqual([
      "propose",
      "create-stack",
    ]);
  });

  it("Prêt : « L'architecture est validée », aucune action, aucun compte", () => {
    const state = technicalHeaderStateOf(input({ viewKind: "empty", deliverable: "todo" }));
    expect(state).toEqual({
      status: "ready",
      summary: "L'architecture est validée",
      actions: [],
    });
  });

  it("Génération puis Relecture", () => {
    expect(technicalHeaderStateOf(input({ reviewing: true, generating: true }))).toEqual({
      status: "generating",
      summary: "Depuis l'architecture",
      actions: ["add", "propose"],
    });
    const review = technicalHeaderStateOf(input({ reviewing: true, pending: 12 }));
    expect(review.status).toBe("in_progress");
    expect(review.summary).toBe("12 propositions à relire");
    expect(review.actions).toEqual(["add", "repropose"]);
    expect(review.tabCounts?.review).toEqual({ value: 12, tone: "primary" });
  });

  it("Validé : « Validé par l'équipe » et la version", () => {
    const state = technicalHeaderStateOf(
      input({ deliverable: "validated", validation: VALIDATION }),
    );
    expect(state.statusLabel).toBe("Validé par l'équipe");
    expect(state.summary).toBe("Validé par Moussa le 5 nov. · version c07d2b4");
    expect(state.actions).toEqual(["propose", "create-stack"]);
    expect(state.createPrimary).toBe(true);
  });

  it("À revoir : ajout, « Proposer les mises à jour » (omis si l'agent est fermé), « Valider »", () => {
    const revise = input({ deliverable: "revise", validation: VALIDATION });
    const state = technicalHeaderStateOf(revise);
    expect(state.status).toBe("revise");
    expect(state.summary).toBe(
      "Validé le 5 nov., l'architecture a changé depuis · 2 choix à trancher avant de valider",
    );
    expect(state.actions).toEqual(["create-stack", "propose-updates", "validate"]);
    expect(technicalHeaderStateOf({ ...revise, available: false }).actions).toEqual([
      "create-stack",
      "validate",
    ]);
  });

  it("designer : statut et résumé sans aucun bouton ; hors équipe : rien", () => {
    const designer = technicalHeaderStateOf(input({ canWrite: false, agent: false }));
    expect(designer.actions).toEqual([]);
    expect(designer.summary).toContain("24 choix");
    expect(technicalHeaderStateOf(input({ team: false }))).toEqual({ actions: [] });
  });
});
