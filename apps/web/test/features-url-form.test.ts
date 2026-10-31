import { describe, expect, it } from "vitest";
import { readFeaturesUrl, withFeaturesUrl } from "../src/lib/features-url.ts";

/** TK-48 / 48e : paramètres `new=1` et `edit=F-nnn` (S-feature-form §2) ; ils ne coexistent pas avec `feature`. */
describe("readFeaturesUrl — new et edit", () => {
  it("?new=1 -> new: true", () => {
    expect(readFeaturesUrl("?new=1")).toEqual({ new: true });
    expect(readFeaturesUrl("new=1")).toEqual({ new: true });
  });

  it.each(["2", "true", "", "01", "1x"])("new=%s : ignoré", (value) => {
    expect(readFeaturesUrl(`?new=${value}`)).toEqual({});
  });

  it("?edit=F-001 -> edit: 'F-001'", () => {
    expect(readFeaturesUrl("?edit=F-001")).toEqual({ edit: "F-001" });
    expect(readFeaturesUrl("?edit=F-1234")).toEqual({ edit: "F-1234" });
  });

  it.each(["x", "F-1", "f-001", "F-001x", "AC-1", "<script>", ""])("edit=%s : ignoré", (value) => {
    expect(readFeaturesUrl(`?edit=${encodeURIComponent(value)}`)).toEqual({});
  });

  it("new et edit valides ensemble : edit l'emporte", () => {
    expect(readFeaturesUrl("?new=1&edit=F-002")).toEqual({ edit: "F-002" });
  });

  it("new ou edit valide : feature est ignoré (jamais deux panneaux)", () => {
    expect(readFeaturesUrl("?new=1&feature=F-001")).toEqual({ new: true });
    expect(readFeaturesUrl("?edit=F-002&feature=F-001")).toEqual({ edit: "F-002" });
  });

  it("new ou edit invalide : feature reste lu", () => {
    expect(readFeaturesUrl("?new=2&feature=F-001")).toEqual({ feature: "F-001" });
    expect(readFeaturesUrl("?edit=x&feature=F-001")).toEqual({ feature: "F-001" });
  });

  it("les filtres coexistent avec new et edit", () => {
    expect(readFeaturesUrl("?status=brouillon&priority=must&new=1")).toEqual({
      status: "brouillon",
      priority: "must",
      new: true,
    });
  });
});

describe("withFeaturesUrl — new et edit", () => {
  it("pose et efface new", () => {
    expect(withFeaturesUrl("", { new: true })).toBe("?new=1");
    expect(withFeaturesUrl("?new=1", { new: null })).toBe("");
  });

  it("pose et efface edit", () => {
    expect(withFeaturesUrl("", { edit: "F-001" })).toBe("?edit=F-001");
    expect(withFeaturesUrl("?edit=F-001", { edit: null })).toBe("");
  });

  it("conserve filtres et paramètres étrangers", () => {
    expect(withFeaturesUrl("?status=adoptee&utm=x", { new: true })).toBe(
      "?status=adoptee&utm=x&new=1",
    );
    expect(withFeaturesUrl("?status=adoptee&new=1", { new: null })).toBe("?status=adoptee");
  });

  it("passer de la fiche au formulaire : edit posé, feature effacé", () => {
    expect(withFeaturesUrl("?feature=F-001", { edit: "F-001", feature: null })).toBe("?edit=F-001");
  });
});
