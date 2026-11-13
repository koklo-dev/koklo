import { describe, expect, it } from "vitest";
import { type DataHeaderInput, dataHeaderStateOf } from "../src/lib/data-header-state.ts";

/** TK-107 lot C : en-tête de l'écran Données par état (maquette 11 l.588-598, passation 09 §2). */
const base: DataHeaderInput = {
  team: true,
  canWrite: true,
  agent: true,
  reviewing: false,
  generating: false,
  pending: 0,
  viewKind: "list",
  tab: "diagram",
  counts: { tables: 6, relations: 6, fixtures: 2 },
  deliverable: undefined,
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un par état
describe("dataHeaderStateOf", () => {
  it("Prêt : statut, phrase du cahier, aucune action, aucun compteur d'onglet", () => {
    const state = dataHeaderStateOf({
      ...base,
      viewKind: "empty",
      counts: { tables: 0, relations: 0, fixtures: 0 },
    });
    expect(state).toMatchObject({
      status: "ready",
      summary: "Le cahier fonctionnel est enregistré",
      actions: [],
    });
    expect(state.tabCounts).toBeUndefined();
  });

  it("Génération : « Depuis le cahier fonctionnel », Ajouter une table puis Proposer", () => {
    const state = dataHeaderStateOf({ ...base, reviewing: true, generating: true });
    expect(state).toMatchObject({
      status: "generating",
      summary: "Depuis le cahier fonctionnel",
      actions: ["add", "propose"],
    });
  });

  it("Relecture : En cours, « N propositions à relire », Ajouter une table puis Reproposer, onglet N seul, Tables et Jeux comptent les propositions", () => {
    const state = dataHeaderStateOf({
      ...base,
      reviewing: true,
      pending: 7,
      proposedTables: 3,
      proposedFixtures: 1,
    });
    expect(state).toMatchObject({
      status: "in_progress",
      summary: "7 propositions à relire",
      actions: ["add", "repropose"],
    });
    expect(state.tabCounts?.review).toEqual({ value: 7, tone: "primary" });
    expect(state.tabCounts?.tables).toEqual({ value: 9 });
    expect(state.tabCounts?.fixtures).toEqual({ value: 3 });
    expect(state.tabCounts?.diagram).toBeUndefined();
    expect(dataHeaderStateOf({ ...base, reviewing: true, pending: 1 }).summary).toBe(
      "1 proposition à relire",
    );
  });

  it("Liste · équipe : validation de l'équipe, résumé des compteurs, Proposer puis Ajouter (primaire), jamais « Valider »", () => {
    const state = dataHeaderStateOf(base);
    expect(state).toMatchObject({
      status: "in_progress",
      statusLabel: "Validation de l'équipe · le client lit et commente",
      statusIcon: "groups",
      summary: "6 tables · 6 relations · 2 jeux d'exemple",
      actions: ["propose", "create"],
    });
    expect(state.tabCounts).toEqual({
      tables: { value: 6 },
      fixtures: { value: 2 },
    });
    expect(JSON.stringify(state)).not.toContain("Valider");
  });

  it("singuliers : 1 table · 1 relation · 1 jeu d'exemple", () => {
    const state = dataHeaderStateOf({ ...base, counts: { tables: 1, relations: 1, fixtures: 1 } });
    expect(state.summary).toBe("1 table · 1 relation · 1 jeu d'exemple");
  });

  it("un livrable validé garde son statut", () => {
    expect(dataHeaderStateOf({ ...base, deliverable: "validated" })).toMatchObject({
      status: "validated",
    });
  });

  it("sans agent (designer, IA absente) : une seule action ; designer : aucune", () => {
    expect(dataHeaderStateOf({ ...base, agent: false }).actions).toEqual(["create"]);
    expect(dataHeaderStateOf({ ...base, canWrite: false }).actions).toEqual([]);
  });

  it("hors équipe : ni statut, ni résumé, ni action", () => {
    expect(dataHeaderStateOf({ ...base, team: false })).toEqual({ actions: [] });
  });

  it("chargement : actions de l'équipe, pas de résumé", () => {
    const state = dataHeaderStateOf({ ...base, viewKind: "loading", counts: undefined });
    expect(state.summary).toBeUndefined();
    expect(state.actions).toEqual(["propose", "create"]);
  });

  it("Validation de l'équipe (pending) : « Valider le modèle » en dernier, pour qui écrit", () => {
    const state = dataHeaderStateOf({ ...base, deliverable: "pending" });
    expect(state.status).toBe("in_progress");
    expect(state.actions).toEqual(["propose", "create", "validate"]);
  });

  it("À revoir : statut revise et « Valider le modèle » (on peut revalider)", () => {
    const state = dataHeaderStateOf({ ...base, deliverable: "revise" });
    expect(state.status).toBe("revise");
    expect(state.actions).toContain("validate");
  });

  it("Validé : « Validé par Moussa le 5 nov. · version 3c7e1a9 », sans « Valider le modèle »", () => {
    const state = dataHeaderStateOf({
      ...base,
      deliverable: "validated",
      validation: {
        name: "Moussa",
        at: "2026-11-05T10:00:00.000Z",
        sha: "3c7e1a9".padEnd(40, "0"),
      },
    });
    expect(state.status).toBe("validated");
    expect(state.summary).toBe("Validé par Moussa le 5 nov. · version 3c7e1a9");
    expect(state.actions).toEqual(["propose", "create"]);
  });

  it("Validé sans prénom ni SHA : « Validé par l'équipe le 5 nov. »", () => {
    const state = dataHeaderStateOf({
      ...base,
      deliverable: "validated",
      validation: { name: null, at: "2026-11-05T10:00:00.000Z", sha: null },
    });
    expect(state.summary).toBe("Validé par l'équipe le 5 nov.");
  });

  it("Validé sans décision lue : les compteurs restent le résumé", () => {
    expect(dataHeaderStateOf({ ...base, deliverable: "validated" }).summary).toBe(
      "6 tables · 6 relations · 2 jeux d'exemple",
    );
  });

  it("designer : jamais « Valider le modèle »", () => {
    const state = dataHeaderStateOf({ ...base, canWrite: false, deliverable: "pending" });
    expect(state.actions).toEqual([]);
  });
});
