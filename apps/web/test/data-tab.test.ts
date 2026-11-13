import { describe, expect, it } from "vitest";
import { DATA_TAB_LABELS, readDataUrl, visibleDataTabs, withDataUrl } from "../src/lib/data-tab.ts";

/** TK-107 lot C : adresse de l'écran Données (`?tab=`, `view=review`, `sel`, `q`, `zone`, `new`, `edit`). */
describe("readDataUrl", () => {
  it("sans paramètre : onglet Diagramme, rien d'ouvert", () => {
    expect(readDataUrl("")).toEqual({
      tab: "diagram",
      review: false,
      sel: undefined,
      q: undefined,
      zone: undefined,
      new: false,
      edit: undefined,
    });
  });

  it("lit l'onglet, la recherche, la zone et la ligne choisie", () => {
    const url = readDataUrl("?tab=tables&q=client&zone=Paiement&sel=T-reservation");
    expect(url).toMatchObject({
      tab: "tables",
      q: "client",
      zone: "Paiement",
      sel: "T-reservation",
    });
  });

  it("un onglet inconnu ouvre le Diagramme ; une sélection qui n'est pas une table est ignorée", () => {
    expect(readDataUrl("?tab=autre&sel=F-001").tab).toBe("diagram");
    expect(readDataUrl("?sel=F-001").sel).toBeUndefined();
  });

  it("view=review ouvre l'onglet Relecture, sauf un autre onglet demandé", () => {
    expect(readDataUrl("?view=review")).toMatchObject({ review: true, tab: "review" });
    expect(readDataUrl("?view=review&tab=fixtures")).toMatchObject({
      review: true,
      tab: "fixtures",
    });
  });

  it("l'onglet Relecture sans relecture ouverte retombe sur le Diagramme", () => {
    expect(readDataUrl("?tab=review")).toMatchObject({ review: false, tab: "diagram" });
  });

  it("?new=1 et ?edit=T-slug ouvrent le formulaire ; un identifiant invalide est ignoré", () => {
    expect(readDataUrl("?new=1").new).toBe(true);
    expect(readDataUrl("?edit=T-client").edit).toBe("T-client");
    expect(readDataUrl("?edit=client").edit).toBeUndefined();
  });
});

describe("withDataUrl", () => {
  it("pose et retire les paramètres, sans toucher aux autres", () => {
    expect(withDataUrl("?tab=tables&q=a", { q: "client", zone: "Paiement" })).toBe(
      "?tab=tables&q=client&zone=Paiement",
    );
    expect(withDataUrl("?tab=tables&q=a", { q: null })).toBe("?tab=tables");
  });

  it("review: true écrit view=review, review: null le retire avec l'onglet Relecture", () => {
    expect(withDataUrl("", { review: true })).toBe("?view=review&tab=review");
    expect(withDataUrl("?view=review&tab=review", { review: null })).toBe("");
    expect(withDataUrl("?view=review&tab=tables", { review: null })).toBe("?tab=tables");
  });

  it("une chaîne vide retire le paramètre", () => {
    expect(withDataUrl("?q=a", { q: "" })).toBe("");
  });
});

describe("visibleDataTabs", () => {
  it("Relecture devant Diagramme tant qu'une relecture est ouverte, absente sinon", () => {
    expect(visibleDataTabs(true)).toEqual(["review", "diagram", "tables", "fixtures"]);
    expect(visibleDataTabs(false)).toEqual(["diagram", "tables", "fixtures"]);
  });

  it("libellés de la maquette 11", () => {
    expect(DATA_TAB_LABELS).toEqual({
      review: "Relecture",
      diagram: "Diagramme",
      tables: "Tables",
      fixtures: "Jeux d'exemple",
    });
  });
});

describe("onglet par défaut sous 1024 px (TK-108, B425)", () => {
  it("sans onglet demandé, le Diagramme sur grand écran et les Tables sur petit écran", () => {
    expect(readDataUrl("").tab).toBe("diagram");
    expect(readDataUrl("", { narrow: false }).tab).toBe("diagram");
    expect(readDataUrl("", { narrow: true }).tab).toBe("tables");
  });

  it("un onglet demandé ou la relecture priment sur la largeur", () => {
    expect(readDataUrl("?tab=diagram", { narrow: true }).tab).toBe("diagram");
    expect(readDataUrl("?tab=fixtures", { narrow: true }).tab).toBe("fixtures");
    expect(readDataUrl("?view=review", { narrow: true }).tab).toBe("review");
  });
});
