import { describe, expect, it } from "vitest";
import { headerStateOf } from "../src/lib/features-header-state.ts";

/** TK-102 lot B : en-tête par état (maquette 10 l.637-658 : statut, résumé, actions). */
const BASE = {
  team: true,
  canWrite: true,
  agent: true,
  reviewing: false,
  generating: false,
  pending: 0,
  viewKind: "list" as const,
  total: 12 as number | undefined,
  deliverable: undefined,
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("headerStateOf", () => {
  it("Prêt : statut Prêt, aucune action (la carte de l'agent les porte)", () => {
    const state = headerStateOf({ ...BASE, viewKind: "empty", total: 0 });
    expect(state.status).toBe("ready");
    expect(state.summary).toBe("Rien encore · dossier d'idée figé disponible");
    expect(state.actions).toEqual([]);
  });

  it("Génération : « Ajouter » puis « Proposer avec l'agent » désactivé", () => {
    const state = headerStateOf({ ...BASE, reviewing: true, generating: true });
    expect(state.status).toBe("generating");
    expect(state.summary).toBe("Depuis le dossier d'idée figé");
    expect(state.actions).toEqual(["add", "propose"]);
  });

  it("Relecture : En cours, « N propositions à relire », « Ajouter » puis « Reproposer »", () => {
    const state = headerStateOf({ ...BASE, reviewing: true, pending: 7 });
    expect(state.status).toBe("in_progress");
    expect(state.summary).toBe("7 propositions à relire");
    expect(state.actions).toEqual(["add", "repropose"]);
  });

  it("Relecture d'une seule proposition : singulier", () => {
    expect(headerStateOf({ ...BASE, reviewing: true, pending: 1 }).summary).toBe(
      "1 proposition à relire",
    );
  });

  it("Liste : statut du livrable, compte, « Proposer avec l'agent » puis « Nouvelle fonctionnalité » (primaire)", () => {
    const state = headerStateOf({ ...BASE, deliverable: "pending" });
    expect(state.status).toBe("pending");
    expect(state.summary).toBe("12 fonctionnalités");
    expect(state.actions).toEqual(["propose", "create"]);
  });

  it("Liste : livrable non envoyé = En cours ; une fonctionnalité au singulier", () => {
    const state = headerStateOf({ ...BASE, deliverable: "todo", total: 1 });
    expect(state.status).toBe("in_progress");
    expect(state.summary).toBe("1 fonctionnalité");
  });

  it("sans droit d'écriture : aucune action", () => {
    expect(headerStateOf({ ...BASE, canWrite: false }).actions).toEqual([]);
  });

  it("l'équipe lisante garde statut et résumé", () => {
    expect(headerStateOf({ ...BASE, canWrite: false, deliverable: "validated" }).status).toBe(
      "validated",
    );
  });

  it("hors équipe (client, business) : ni statut, ni résumé, ni action", () => {
    expect(headerStateOf({ ...BASE, team: false, canWrite: false })).toEqual({
      actions: [],
      tabCount: { value: 12 },
    });
  });

  it("chargement ou erreur : aucun statut ni résumé, les actions d'écriture restent", () => {
    expect(headerStateOf({ ...BASE, viewKind: "loading", total: undefined })).toEqual({
      actions: ["propose", "create"],
    });
  });

  it("spec vide sans agent : pas d'état Prêt, « Nouvelle fonctionnalité » seule", () => {
    const state = headerStateOf({ ...BASE, viewKind: "empty", total: 0, agent: false });
    expect(state.status).toBeUndefined();
    expect(state.actions).toEqual(["create"]);
  });
});

describe("compteur de l'onglet Fonctionnalités", () => {
  it("Liste : le nombre ; Génération : « … » ; Relecture : « N à relire » en teinte primary ; Prêt : aucun", () => {
    expect(headerStateOf(BASE).tabCount).toEqual({ value: 12 });
    expect(headerStateOf({ ...BASE, reviewing: true, generating: true }).tabCount).toEqual({
      value: "…",
    });
    expect(headerStateOf({ ...BASE, reviewing: true, pending: 4 }).tabCount).toEqual({
      value: "4 à relire",
      tone: "primary",
    });
    expect(headerStateOf({ ...BASE, viewKind: "empty", total: 0 }).tabCount).toBeUndefined();
  });
});
