import { describe, expect, it } from "vitest";
import {
  ARCHITECTURE_TAB_LABELS,
  readArchitectureUrl,
  visibleArchitectureTabs,
  withArchitectureUrl,
} from "../src/lib/architecture-tab.ts";

/** TK-111 lot C : adresse de l'écran Architecture (`?tab=`, `view=review`, `c`, `s`, `q`, `zone`, `new`, `edit`). */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("readArchitectureUrl", () => {
  it("sans paramètre : onglet Schéma (par défaut, B548), rien d'ouvert", () => {
    expect(readArchitectureUrl("")).toEqual({
      tab: "schema",
      review: false,
      c: undefined,
      s: undefined,
      sel: undefined,
      f: undefined,
      q: undefined,
      zone: undefined,
      new: false,
      edit: undefined,
    });
  });

  it("lit l'onglet, la recherche, la zone, le composant et la section", () => {
    expect(readArchitectureUrl("?tab=document&s=principes")).toMatchObject({
      tab: "document",
      s: "principes",
    });
    expect(readArchitectureUrl("?q=api&zone=Paiement&c=C-api")).toMatchObject({
      q: "api",
      zone: "Paiement",
      c: "C-api",
    });
  });

  it("TK-112 : sous 1024 px le défaut est Composants, un onglet demandé prime (B548)", () => {
    expect(readArchitectureUrl("", false).tab).toBe("components");
    expect(readArchitectureUrl("?tab=schema", false).tab).toBe("schema");
    expect(readArchitectureUrl("?tab=flows", true).tab).toBe("flows");
    expect(readArchitectureUrl("?tab=components", true).tab).toBe("components");
  });

  it("TK-112 : ?sel= lit un composant ou un acteur, ?f= un flux, ?edit= un composant ou un flux", () => {
    expect(readArchitectureUrl("?sel=C-api&f=P-reserver")).toMatchObject({
      sel: "C-api",
      f: "P-reserver",
    });
    expect(readArchitectureUrl("?sel=RL-client").sel).toBe("RL-client");
    expect(readArchitectureUrl("?edit=P-reserver").edit).toBe("P-reserver");
    expect(readArchitectureUrl("?sel=T-client&f=C-api").sel).toBeUndefined();
    expect(readArchitectureUrl("?sel=T-client&f=C-api").f).toBeUndefined();
  });

  it("un onglet inconnu ouvre le défaut ; un identifiant qui n'est pas un composant est ignoré", () => {
    expect(readArchitectureUrl("?tab=inconnu").tab).toBe("schema");
    expect(readArchitectureUrl("?c=T-client&edit=F-001&s=Pas%20un%20slug")).toMatchObject({
      c: undefined,
      edit: undefined,
      s: undefined,
    });
  });

  it("view=review ouvre l'onglet Relecture, sauf un autre onglet demandé ; tab=review sans relecture retombe", () => {
    expect(readArchitectureUrl("?view=review")).toMatchObject({ review: true, tab: "review" });
    expect(readArchitectureUrl("?view=review&tab=document")).toMatchObject({
      review: true,
      tab: "document",
    });
    expect(readArchitectureUrl("?tab=review")).toMatchObject({ review: false, tab: "schema" });
  });

  it("lit le formulaire : ?new=1 et ?edit=C-api", () => {
    expect(readArchitectureUrl("?new=1")).toMatchObject({ new: true });
    expect(readArchitectureUrl("?edit=C-api")).toMatchObject({ edit: "C-api" });
  });
});

describe("withArchitectureUrl", () => {
  it("écrit puis retire les paramètres ; chaîne vide ou null les retirent", () => {
    expect(withArchitectureUrl("", { tab: "document", s: "contexte" })).toBe(
      "?tab=document&s=contexte",
    );
    expect(withArchitectureUrl("?tab=document&q=x", { q: null, tab: "components" })).toBe(
      "?tab=components",
    );
    expect(withArchitectureUrl("?q=x", { q: "" })).toBe("");
  });

  it("review: true écrit view=review et l'onglet Relecture ; null retire les deux", () => {
    expect(withArchitectureUrl("", { review: true })).toBe("?view=review&tab=review");
    expect(withArchitectureUrl("?view=review&tab=review", { review: null })).toBe("");
  });

  it("TK-112 : sel et f s'écrivent et se retirent", () => {
    expect(withArchitectureUrl("", { tab: "schema", sel: "C-api" })).toBe("?tab=schema&sel=C-api");
    expect(withArchitectureUrl("?f=P-reserver", { f: null })).toBe("");
  });

  it("new et edit : ?new=1, ?edit=C-api", () => {
    expect(withArchitectureUrl("", { new: true })).toBe("?new=1");
    expect(withArchitectureUrl("?new=1", { new: null, edit: "C-api" })).toBe("?edit=C-api");
  });
});

describe("onglets visibles", () => {
  it("Schéma, Document, Composants et Flux hors relecture ; Relecture en tête pendant une relecture", () => {
    expect(visibleArchitectureTabs(false)).toEqual([
      "schema",
      "document",
      "components",
      "decisions",
      "flows",
    ]);
    expect(visibleArchitectureTabs(true)).toEqual([
      "review",
      "schema",
      "document",
      "components",
      "decisions",
      "flows",
    ]);
  });

  it("Décisions : libellé, icône gavel, entre Composants et Flux (TK-113)", () => {
    expect(Object.values(ARCHITECTURE_TAB_LABELS)).toEqual([
      "Relecture",
      "Schéma",
      "Document",
      "Composants",
      "Décisions",
      "Flux",
    ]);
  });

  it("lit la décision ouverte et ses filtres ; ignore ce qui n'est pas une ADR, un statut ou une période", () => {
    expect(
      readArchitectureUrl("?tab=decisions&d=ADR-003&status=acceptee&component=C-api&period=90j"),
    ).toMatchObject({
      tab: "decisions",
      d: "ADR-003",
      status: "acceptee",
      component: "C-api",
      period: "90j",
    });
    expect(readArchitectureUrl("?d=C-api&status=x&period=y&component=T-a")).toMatchObject({
      d: undefined,
      status: undefined,
      period: undefined,
      component: undefined,
    });
    expect(readArchitectureUrl("?edit=ADR-006").edit).toBe("ADR-006");
  });

  it("écrit et retire les paramètres des décisions", () => {
    expect(withArchitectureUrl("", { tab: "decisions", d: "ADR-003", status: "proposee" })).toBe(
      "?tab=decisions&d=ADR-003&status=proposee",
    );
    expect(withArchitectureUrl("?d=ADR-003&status=proposee", { d: null, status: null })).toBe("");
  });
});
