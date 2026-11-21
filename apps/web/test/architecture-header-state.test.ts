import { describe, expect, it } from "vitest";
import {
  type ArchitectureHeaderInput,
  architectureHeaderStateOf,
  architectureSummaryOf,
} from "../src/lib/architecture-header-state.ts";

/** TK-111 lot C (maquette 13 l.58-88, 859-866) : en-tête de l'écran Architecture par état. */
const base: ArchitectureHeaderInput = {
  team: true,
  canWrite: true,
  agent: true,
  reviewing: false,
  generating: false,
  pending: 0,
  viewKind: "list",
  tab: "components",
  counts: { components: 34 },
  deliverable: "pending",
};

describe("résumé", () => {
  it("« 34 composants », « 1 composant »", () => {
    expect(architectureSummaryOf({ components: 34 })).toBe("34 composants");
    expect(architectureSummaryOf({ components: 1 })).toBe("1 composant");
  });

  it("TK-112 (B548) : « 34 composants · 18 flux » quand les flux sont lus", () => {
    expect(architectureSummaryOf({ components: 34, flows: 18 })).toBe("34 composants · 18 flux");
    expect(architectureSummaryOf({ components: 1, flows: 1 })).toBe("1 composant · 1 flux");
  });
});

describe("TK-112 : onglets Schéma et Flux", () => {
  it("le résumé et l'onglet Flux comptent les flux ; Schéma n'a pas de compteur", () => {
    const state = architectureHeaderStateOf({ ...base, counts: { components: 34, flows: 18 } });
    expect(state.summary).toBe("34 composants · 18 flux");
    expect(state.tabCounts).toEqual({ components: { value: 34 }, flows: { value: 18 } });
  });

  it("onglet Flux : « Nouveau flux » remplace « Nouveau composant » ; le designer n'a aucun bouton", () => {
    expect(architectureHeaderStateOf({ ...base, tab: "flows" }).actions).toEqual([
      "propose",
      "create-flow",
    ]);
    expect(architectureHeaderStateOf({ ...base, tab: "schema" }).actions).toEqual([
      "propose",
      "create",
    ]);
    expect(architectureHeaderStateOf({ ...base, tab: "flows", canWrite: false }).actions).toEqual(
      [],
    );
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("architectureHeaderStateOf", () => {
  it("Prêt : statut, résumé « fonctionnel et données validés », aucune action dans l'en-tête", () => {
    const state = architectureHeaderStateOf({
      ...base,
      viewKind: "empty",
      counts: { components: 0 },
    });
    expect(state).toMatchObject({
      status: "ready",
      summary: "Le fonctionnel et les données sont validés",
      actions: [],
    });
  });

  it("Génération : « Depuis le fonctionnel et les données », Ajouter et Proposer, aucun onglet compté", () => {
    const state = architectureHeaderStateOf({ ...base, reviewing: true, generating: true });
    expect(state).toMatchObject({
      status: "generating",
      summary: "Depuis le fonctionnel et les données",
      actions: ["add", "propose"],
    });
    expect(state.tabCounts).toBeUndefined();
  });

  it("Relecture : « N propositions à relire », Ajouter et Reproposer, compteur Relecture en primaire", () => {
    const state = architectureHeaderStateOf({
      ...base,
      reviewing: true,
      pending: 12,
      proposedComponents: 5,
    });
    expect(state).toMatchObject({
      status: "in_progress",
      summary: "12 propositions à relire",
      actions: ["add", "repropose"],
    });
    expect(state.tabCounts?.review).toEqual({ value: 12, tone: "primary" });
    expect(state.tabCounts?.components).toEqual({ value: 39 });
    expect(state.tabCounts?.document).toBeUndefined();
  });

  it("Liste · équipe : validation de l'équipe, résumé, Proposer puis Nouveau composant ; pas de Valider (TK-114)", () => {
    const state = architectureHeaderStateOf(base);
    expect(state).toMatchObject({
      status: "in_progress",
      statusLabel: "Validation de l'équipe · le client lit et commente",
      summary: "34 composants",
      actions: ["propose", "create"],
    });
    expect(state.tabCounts).toEqual({ components: { value: 34 } });
  });

  it("onglet Document : aucun bouton d'ajout, l'agent reste proposé", () => {
    expect(architectureHeaderStateOf({ ...base, tab: "document" }).actions).toEqual(["propose"]);
  });

  it("validé et à revoir gardent leur statut serveur", () => {
    expect(architectureHeaderStateOf({ ...base, deliverable: "validated" })).toMatchObject({
      status: "validated",
      statusLabel: "Validé par l'équipe",
    });
    expect(architectureHeaderStateOf({ ...base, deliverable: "revise" }).status).toBe("revise");
  });

  it("le designer lit sans bouton d'écriture ; hors équipe, rien n'est dit", () => {
    expect(architectureHeaderStateOf({ ...base, canWrite: false }).actions).toEqual([]);
    expect(architectureHeaderStateOf({ ...base, team: false })).toEqual({ actions: [] });
  });

  it("chargement et erreur : pas de statut, seulement les actions", () => {
    const state = architectureHeaderStateOf({ ...base, viewKind: "loading", counts: undefined });
    expect(state.status).toBeUndefined();
    expect(state.actions).toEqual(["propose", "create"]);
  });
});
