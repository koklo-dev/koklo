import { describe, expect, it } from "vitest";
import {
  ARCHITECTURE_TAB_LABELS,
  readArchitectureUrl,
  visibleArchitectureTabs,
  withArchitectureUrl,
} from "../src/lib/architecture-tab.ts";

/** TK-111 lot C : adresse de l'écran Architecture (`?tab=`, `view=review`, `c`, `s`, `q`, `zone`, `new`, `edit`). */
describe("readArchitectureUrl", () => {
  it("sans paramètre : onglet Composants (par défaut), rien d'ouvert", () => {
    expect(readArchitectureUrl("")).toEqual({
      tab: "components",
      review: false,
      c: undefined,
      s: undefined,
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

  it("un onglet inconnu ouvre Composants ; un identifiant qui n'est pas un composant est ignoré", () => {
    expect(readArchitectureUrl("?tab=schema").tab).toBe("components");
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
    expect(readArchitectureUrl("?tab=review")).toMatchObject({ review: false, tab: "components" });
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

  it("new et edit : ?new=1, ?edit=C-api", () => {
    expect(withArchitectureUrl("", { new: true })).toBe("?new=1");
    expect(withArchitectureUrl("?new=1", { new: null, edit: "C-api" })).toBe("?edit=C-api");
  });
});

describe("onglets visibles", () => {
  it("Document et Composants seulement hors relecture ; Relecture en tête pendant une relecture", () => {
    expect(visibleArchitectureTabs(false)).toEqual(["document", "components"]);
    expect(visibleArchitectureTabs(true)).toEqual(["review", "document", "components"]);
  });

  it("jamais Schéma, Décisions ni Flux (TK-112, TK-113)", () => {
    expect(Object.values(ARCHITECTURE_TAB_LABELS)).toEqual(["Relecture", "Document", "Composants"]);
  });
});
