import { describe, expect, it } from "vitest";
import { readFeaturesUrl, withFeaturesTab, withFeaturesUrl } from "../src/lib/features-url.ts";

/** TK-103 lot B : l'adresse des trois nouveaux onglets (`?tab=`, `?sel=`, `?type=`, `?new=1`, `?edit=`). */
describe("readFeaturesUrl par onglet", () => {
  it.each([
    ["rules", "R-250"],
    ["roles", "RL-accueil"],
    ["flows", "P-reserver"],
    ["features", "F-001"],
  ])("onglet %s : `?sel=` lit %s", (tab, id) => {
    expect(readFeaturesUrl(`?tab=${tab}&sel=${id}`)).toEqual({ feature: id });
  });

  it.each([
    ["rules", "F-001"],
    ["rules", "RL-accueil"],
    ["roles", "R-001"],
    ["flows", "R-001"],
    ["features", "R-001"],
    ["rules", "R-1"],
    ["roles", "RL-Accueil"],
    ["flows", "P-<script>"],
  ])("onglet %s : un identifiant %s d'un autre type ou mal formé est ignoré", (tab, id) => {
    expect(readFeaturesUrl(`?tab=${tab}&sel=${encodeURIComponent(id)}`)).toEqual({});
  });

  it("`?edit=` suit aussi l'onglet", () => {
    expect(readFeaturesUrl("?tab=rules&edit=R-002")).toEqual({ edit: "R-002" });
    expect(readFeaturesUrl("?tab=flows&edit=R-002")).toEqual({});
  });

  it("lit le filtre de type des règles et ignore une valeur inconnue", () => {
    expect(readFeaturesUrl("?tab=rules&type=workflow")).toEqual({ type: "workflow" });
    expect(readFeaturesUrl("?tab=rules&type=autre")).toEqual({});
  });

  it("sans `tab`, l'identifiant des fonctionnalités reste F-nnn (liens déjà partagés)", () => {
    expect(readFeaturesUrl("?feature=F-001")).toEqual({ feature: "F-001" });
  });
});

describe("withFeaturesUrl : type", () => {
  it("pose et retire `type`", () => {
    expect(new URLSearchParams(withFeaturesUrl("?tab=rules", { type: "calcul" })).get("type")).toBe(
      "calcul",
    );
    expect(withFeaturesUrl("?type=calcul", { type: null })).toBe("");
  });
});

describe("withFeaturesTab", () => {
  it("garde l'onglet demandé en tête de la requête (features par défaut)", () => {
    expect(withFeaturesTab("?q=x")).toBe("?tab=features&q=x");
    expect(withFeaturesTab("?q=x", "rules")).toBe("?tab=rules&q=x");
    expect(withFeaturesTab("?tab=flows&sel=P-a", "flows")).toBe("?tab=flows&sel=P-a");
  });
});
