import { describe, expect, it } from "vitest";
import {
  readTechnicalUrl,
  visibleTechnicalTabs,
  withTechnicalUrl,
} from "../src/lib/technical-tab.ts";

/** TK-115 lot C : adresse de la page Technique (onglets, choix ouvert, recherche, formulaire). */
describe("adresse de la page Technique", () => {
  it("sans paramètre : Stack ; relecture : onglet Relecture devant", () => {
    expect(readTechnicalUrl("")).toMatchObject({ tab: "stack", review: false });
    expect(readTechnicalUrl("view=review")).toMatchObject({ tab: "review", review: true });
    expect(readTechnicalUrl("tab=review").tab).toBe("stack");
    expect(readTechnicalUrl("tab=api").tab).toBe("stack");
    expect(visibleTechnicalTabs(false)).toEqual(["stack", "environments", "document"]);
    expect(visibleTechnicalTabs(true)).toEqual(["review", "stack", "environments", "document"]);
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
});
