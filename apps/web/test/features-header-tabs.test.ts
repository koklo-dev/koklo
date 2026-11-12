import { describe, expect, it } from "vitest";
import { headerStateOf } from "../src/lib/features-header-state.ts";

/** TK-103 lot B : en-tête par onglet (maquette 10 l.637-690, B337 a levée) : compteurs, résumé, libellé d'ajout. */
const COUNTS = { features: 12, rules: 300, roles: 3, flows: 18 };
const BASE = {
  team: true,
  canWrite: true,
  agent: true,
  reviewing: false,
  generating: false,
  pending: 0,
  viewKind: "list" as const,
  total: 300 as number | undefined,
  deliverable: undefined,
  tab: "rules" as const,
  counts: COUNTS,
  pendingByTab: { features: 0, rules: 0, roles: 0, flows: 0 },
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("headerStateOf par onglet", () => {
  it("Liste : un compteur par onglet, le total de chacun", () => {
    expect(headerStateOf(BASE).tabCounts).toEqual({
      features: { value: 12 },
      rules: { value: 300 },
      roles: { value: 3 },
      flows: { value: 18 },
    });
  });

  it("Liste : résumé « N fonctionnalités · N règles · N rôles · N parcours »", () => {
    expect(headerStateOf(BASE).summary).toBe(
      "12 fonctionnalités · 300 règles · 3 rôles · 18 parcours",
    );
    expect(
      headerStateOf({ ...BASE, counts: { features: 1, rules: 1, roles: 1, flows: 1 } }).summary,
    ).toBe("1 fonctionnalité · 1 règle · 1 rôle · 1 parcours");
  });

  it("Relecture : « N à relire » par onglet, sans compteur pour un onglet sans proposition", () => {
    const state = headerStateOf({
      ...BASE,
      reviewing: true,
      pending: 7,
      pendingByTab: { features: 4, rules: 3, roles: 0, flows: 0 },
    });
    expect(state.tabCounts).toEqual({
      features: { value: "4 à relire", tone: "primary" },
      rules: { value: "3 à relire", tone: "primary" },
    });
  });

  it("Génération : « … » sur chaque onglet", () => {
    const state = headerStateOf({ ...BASE, reviewing: true, generating: true });
    expect(Object.values(state.tabCounts ?? {})).toEqual([
      { value: "…" },
      { value: "…" },
      { value: "…" },
      { value: "…" },
    ]);
  });

  it("onglet vide alors que la spec ne l'est pas : pas l'état Prêt, les actions d'écriture restent", () => {
    const state = headerStateOf({
      ...BASE,
      viewKind: "empty",
      total: 0,
      counts: { ...COUNTS, rules: 0 },
    });
    expect(state.status).not.toBe("ready");
    expect(state.actions).toEqual(["propose", "create"]);
  });

  it("spec entièrement vide : état Prêt, aucun compteur", () => {
    const state = headerStateOf({
      ...BASE,
      viewKind: "empty",
      total: 0,
      counts: { features: 0, rules: 0, roles: 0, flows: 0 },
    });
    expect(state.status).toBe("ready");
    expect(state.actions).toEqual([]);
  });

  it("hors équipe : les compteurs restent, ni statut ni résumé", () => {
    const state = headerStateOf({ ...BASE, team: false, canWrite: false });
    expect(state.summary).toBeUndefined();
    expect(state.tabCounts?.roles).toEqual({ value: 3 });
  });
});
