import { describe, expect, it } from "vitest";
import {
  readSecurityUrl,
  securityFormOf,
  securityTargetOf,
  visibleSecurityTabs,
  withSecurityUrl,
} from "../src/lib/security-tab.ts";

/** TK-117 lot C : adresse de la page Sécurité (fiche §7). */
describe("adresse de la Sécurité", () => {
  it("onglet par défaut Menaces ; Relecture par view=review ou tab=review", () => {
    expect(readSecurityUrl("").tab).toBe("threats");
    expect(readSecurityUrl("?view=review").tab).toBe("review");
    expect(readSecurityUrl("?tab=review")).toMatchObject({ tab: "review", review: true });
    expect(readSecurityUrl("?tab=inconnu").tab).toBe("threats");
    expect(visibleSecurityTabs(false)).toEqual([
      "threats",
      "data",
      "rights",
      "reqs",
      "summary",
      "doc",
    ]);
    expect(visibleSecurityTabs(true)[0]).toBe("review");
  });

  it("menace, filtre, recherche, champ, création et modification ; valeurs invalides ignorées", () => {
    const url = readSecurityUrl("?threat=SEC-T08&filter=todo&q=sms&data=clients.telephone&new=1");
    expect(url).toMatchObject({
      threat: "SEC-T08",
      filter: "todo",
      q: "sms",
      data: "clients.telephone",
      new: true,
    });
    expect(readSecurityUrl("?edit=SEC-T01").edit).toBe("SEC-T01");
    expect(readSecurityUrl("?edit=clients.nom").edit).toBe("clients.nom");
    const bad = readSecurityUrl("?threat=../x&filter=tout&data=clients&edit=F-001");
    expect(bad.threat ?? bad.filter ?? bad.data ?? bad.edit).toBeUndefined();
  });

  it("changer d'onglet remet la recherche et le filtre à zéro ; null retire un paramètre", () => {
    expect(withSecurityUrl("?tab=threats&q=a&filter=high", { tab: "data" })).toBe("?tab=data");
    expect(withSecurityUrl("?tab=threats&threat=SEC-T01", { threat: null })).toBe("?tab=threats");
    expect(withSecurityUrl("?tab=summary&view=review", { review: null })).toBe("?tab=summary");
    expect(withSecurityUrl("", { review: true })).toBe("?view=review&tab=review");
  });

  it("feuille d'un élément et adresse qui l'ouvre", () => {
    expect(securityFormOf("SEC-T08", "data")).toBe("threat");
    expect(securityFormOf("clients.telephone", "threats")).toBe("sensitive");
    expect(securityFormOf(undefined, "data")).toBe("sensitive");
    expect(securityFormOf(undefined, "rights")).toBe("threat");
    expect(securityTargetOf("SEC-T08")).toEqual({ tab: "threats", threat: "SEC-T08" });
    expect(securityTargetOf("clients.nom")).toEqual({ tab: "data", data: "clients.nom" });
  });
});
