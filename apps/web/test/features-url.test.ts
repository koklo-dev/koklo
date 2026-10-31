import { describe, expect, it } from "vitest";
import { readFeaturesUrl, withFeaturesUrl } from "../src/lib/features-url.ts";

/** TK-48 / 48d : filtres et fiche dans l'adresse (design/screens/S-features.md §2, §5). */
const params = (search: string) => Object.fromEntries(new URLSearchParams(search));

describe("readFeaturesUrl", () => {
  it("lit status, priority et feature, avec ou sans « ? »", () => {
    const expected = { status: "specifiee", priority: "must", feature: "F-001" };
    expect(readFeaturesUrl("?status=specifiee&priority=must&feature=F-001")).toEqual(expected);
    expect(readFeaturesUrl("status=specifiee&priority=must&feature=F-001")).toEqual(expected);
  });

  it("une adresse vide donne un état vide", () => {
    expect(readFeaturesUrl("")).toEqual({});
    expect(readFeaturesUrl("?")).toEqual({});
  });

  it.each(["brouillon", "specifiee", "implementee", "adoptee"])(
    "accepte le statut %s",
    (status) => {
      expect(readFeaturesUrl(`?status=${status}`)).toEqual({ status });
    },
  );

  it.each(["must", "should", "could", "wont"])("accepte la priorité %s", (priority) => {
    expect(readFeaturesUrl(`?priority=${priority}`)).toEqual({ priority });
  });

  it.each([
    "?status=draft",
    "?status=",
    "?status=BROUILLON",
    "?priority=high",
    "?priority=",
    "?status=brouillon&status=adoptee&x=1",
  ])("ignore une valeur inconnue (%s)", (search) => {
    const state = readFeaturesUrl(search);
    expect(state.priority).toBeUndefined();
    expect(["brouillon", undefined]).toContain(state.status);
  });

  it.each(["F-001", "F-042", "F-1234"])("accepte l'identifiant %s", (feature) => {
    expect(readFeaturesUrl(`?feature=${feature}`)).toEqual({ feature });
  });

  it.each([
    "f-001",
    "F-1",
    "F-12",
    "F-001x",
    "F-0a1",
    "AC-001",
    "001",
    "",
    "F-001%0A",
    "..%2F..%2Fetc",
    "<script>",
  ])("ignore un identifiant de fiche qui ne respecte pas F-nnn (%s)", (feature) => {
    expect(readFeaturesUrl(`?feature=${feature}`)).toEqual({});
  });
});

describe("withFeaturesUrl", () => {
  it("ajoute un paramètre et rend une query string commençant par « ? »", () => {
    const next = withFeaturesUrl("", { status: "adoptee" });
    expect(next.startsWith("?")).toBe(true);
    expect(params(next)).toEqual({ status: "adoptee" });
  });

  it("cumule statut, priorité et fiche", () => {
    const next = withFeaturesUrl("?status=adoptee", { priority: "wont", feature: "F-003" });
    expect(params(next)).toEqual({ status: "adoptee", priority: "wont", feature: "F-003" });
  });

  it("null efface le paramètre, les autres sont conservés", () => {
    const next = withFeaturesUrl("?status=adoptee&priority=wont&feature=F-003", { feature: null });
    expect(params(next)).toEqual({ status: "adoptee", priority: "wont" });
  });

  it("rend une chaîne vide quand plus aucun paramètre ne reste", () => {
    expect(withFeaturesUrl("?status=adoptee", { status: null })).toBe("");
    expect(withFeaturesUrl("", {})).toBe("");
  });

  it("remplace une valeur existante au lieu de la dupliquer", () => {
    const next = withFeaturesUrl("?status=adoptee", { status: "brouillon" });
    expect(new URLSearchParams(next).getAll("status")).toEqual(["brouillon"]);
  });

  it("conserve les paramètres étrangers au module", () => {
    expect(params(withFeaturesUrl("?utm=x", { status: "adoptee" }))).toEqual({
      utm: "x",
      status: "adoptee",
    });
  });
});
