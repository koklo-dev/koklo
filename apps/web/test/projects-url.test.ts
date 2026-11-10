import { describe, expect, it } from "vitest";
import { readProjectsUrl, withProjectsUrl } from "../src/lib/projects-url.ts";

/** TK-93 lot B : recherche, phase et tri de `/projects` vivent dans l'adresse (S-projects v7 §3). */
describe("readProjectsUrl", () => {
  it("adresse vide : tout, tri par activité, pas de recherche", () => {
    expect(readProjectsUrl("")).toEqual({ q: "", phase: null, sort: "activity" });
  });

  it("lit q, phase et sort", () => {
    expect(readProjectsUrl("?q=hexa&phase=framing&sort=name")).toEqual({
      q: "hexa",
      phase: "framing",
      sort: "name",
    });
  });

  it("ignore une phase ou un tri inconnus, et coupe une recherche trop longue", () => {
    const url = readProjectsUrl(`?phase=baseline&sort=chaos&q=${"x".repeat(300)}`);
    expect(url.phase).toBeNull();
    expect(url.sort).toBe("activity");
    expect(url.q).toHaveLength(200);
  });
});

describe("withProjectsUrl", () => {
  it("écrit les valeurs non défaut et retire les autres", () => {
    expect(withProjectsUrl("", { q: "hexa", phase: "idea", sort: "attention" })).toBe(
      "?q=hexa&phase=idea&sort=attention",
    );
    expect(withProjectsUrl("?q=hexa&phase=idea", { q: null, phase: null })).toBe("");
    expect(withProjectsUrl("?sort=name", { sort: "activity" })).toBe("");
  });

  it("garde les paramètres étrangers et ne garde pas une recherche vide", () => {
    expect(withProjectsUrl("?foo=1", { q: "  " })).toBe("?foo=1");
    expect(withProjectsUrl("?foo=1", { phase: "framing" })).toBe("?foo=1&phase=framing");
  });
});
