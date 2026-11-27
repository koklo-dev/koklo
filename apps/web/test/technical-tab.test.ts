import { describe, expect, it } from "vitest";
import {
  readTechnicalUrl,
  technicalTargetOf,
  visibleTechnicalTabs,
  withTechnicalUrl,
} from "../src/lib/technical-tab.ts";

/** TK-115 lot C : adresse de la page Technique (onglets, choix ouvert, recherche, formulaire). */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("adresse de la page Technique", () => {
  it("sans paramètre : Stack ; relecture : onglet Relecture devant", () => {
    expect(readTechnicalUrl("")).toMatchObject({ tab: "stack", review: false });
    expect(readTechnicalUrl("view=review")).toMatchObject({ tab: "review", review: true });
    expect(readTechnicalUrl("tab=review").tab).toBe("stack");
    expect(readTechnicalUrl("tab=securite").tab).toBe("stack");
    const tabs = ["stack", "api", "nfr", "environments", "document"];
    expect(visibleTechnicalTabs(false)).toEqual(tabs);
    expect(visibleTechnicalTabs(true)).toEqual(["review", ...tabs]);
  });

  it("API et Exigences (TK-116) : opération, zone et exigence vérifiées", () => {
    expect(readTechnicalUrl("tab=api&op=reservation.cancel&zone=Communication")).toMatchObject({
      tab: "api",
      op: "reservation.cancel",
      zone: "Communication",
    });
    expect(readTechnicalUrl("tab=nfr&nfr=NFR-003")).toMatchObject({ tab: "nfr", nfr: "NFR-003" });
    expect(readTechnicalUrl("op=reservation").op).toBeUndefined();
    expect(readTechnicalUrl("nfr=ST-api").nfr).toBeUndefined();
    expect(readTechnicalUrl("edit=creneau.listAvailable").edit).toBe("creneau.listAvailable");
    expect(readTechnicalUrl("edit=NFR-003").edit).toBe("NFR-003");
    expect(readTechnicalUrl("edit=a.b.c").edit).toBeUndefined();
  });

  it("la recherche est propre à l'onglet : un changement d'onglet la remet à zéro", () => {
    expect(withTechnicalUrl("?tab=api&q=resa", { tab: "stack" })).toBe("?tab=stack");
    expect(withTechnicalUrl("?tab=api&q=resa", { tab: "api" })).toBe("?tab=api&q=resa");
    expect(withTechnicalUrl("?q=sms", { tab: "api", q: "resa" })).toBe("?tab=api&q=resa");
    expect(withTechnicalUrl("?tab=api", { zone: "Agenda", op: null })).toBe("?tab=api&zone=Agenda");
  });

  it("identifiants vérifiés : choix, section, recherche et formulaire", () => {
    expect(readTechnicalUrl("sel=ST-sms&q=sms&new=1&s=objet")).toMatchObject({
      sel: "ST-sms",
      q: "sms",
      new: true,
      s: "objet",
    });
    expect(readTechnicalUrl("sel=C-api").sel).toBeUndefined();
    expect(readTechnicalUrl("edit=ENV-recette").edit).toBe("ENV-recette");
    expect(readTechnicalUrl("edit=ST-api").edit).toBe("ST-api");
    expect(readTechnicalUrl("edit=F-001").edit).toBeUndefined();
  });

  it("un patch retire les valeurs nulles et gère la relecture", () => {
    expect(withTechnicalUrl("?q=a&sel=ST-api", { q: null })).toBe("?sel=ST-api");
    expect(withTechnicalUrl("", { review: true })).toContain("view=review");
    expect(withTechnicalUrl("?view=review&tab=review", { review: null })).toBe("");
  });

  it.each([
    ["ST-sms", "?sel=ST-sms&tab=stack"],
    ["ENV-recette", "?tab=environments"],
    ["reservation.cancel", "?tab=api&op=reservation.cancel"],
    ["NFR-003", "?tab=nfr&nfr=NFR-003"],
  ])("avis d'un élément enregistré : %s s'ouvre dans son onglet", (specId, query) => {
    const opened = new URLSearchParams(withTechnicalUrl("", technicalTargetOf(specId)));
    expect(Object.fromEntries(opened)).toEqual(Object.fromEntries(new URLSearchParams(query)));
  });
});
