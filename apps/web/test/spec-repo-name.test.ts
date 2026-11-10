import { describe, expect, it } from "vitest";
import {
  isValidSpecRepoName,
  SPEC_REPO_NAME_ERROR,
  suggestedRepoName,
} from "../src/lib/spec-repo-name.ts";

/** Même règle que l'API : ^[A-Za-z0-9._-]{1,100}$, ni `.` ni `..`, pas de suffixe `.git`. */
describe("isValidSpecRepoName (AC-48-19, validation avant le premier appel)", () => {
  it.each([
    "alpha-spec",
    "Alpha_Spec.v2",
    "a",
    "a".repeat(100),
    "...x",
    "x..y",
    "0123",
    "mon.depot",
  ])("accepte %j", (name) => {
    expect(isValidSpecRepoName(name)).toBe(true);
  });

  it.each([
    ["vide", ""],
    ["point seul", "."],
    ["deux points", ".."],
    ["suffixe .git", "x.git"],
    ["suffixe .git seul", ".git"],
    ["espace", "mon depot"],
    ["espace final", "depot "],
    ["slash", "org/depot"],
    ["accent", "dépôt"],
    ["101 caractères", "a".repeat(101)],
    ["retour à la ligne", "a\nb"],
    ["emoji", "spec-🚀"],
  ])("refuse %s", (_label, name) => {
    expect(isValidSpecRepoName(name)).toBe(false);
  });

  it("expose le message d'erreur du design, sans terme technique", () => {
    expect(SPEC_REPO_NAME_ERROR).toBe(
      "Utilisez uniquement des lettres, chiffres, points, tirets et tirets bas (100 caractères maximum).",
    );
  });
});

describe("suggestedRepoName (aperçu « <slug>-spec »)", () => {
  it("minuscules, sans accents, tirets", () => {
    expect(suggestedRepoName("Atelier neuf")).toBe("atelier-neuf-spec");
    expect(suggestedRepoName("  Café — Été 2026 ! ")).toBe("cafe-ete-2026-spec");
  });

  it("nom sans lettre ni chiffre : « projet »", () => {
    expect(suggestedRepoName("!!!")).toBe("projet-spec");
    expect(suggestedRepoName("")).toBe("projet-spec");
  });

  it("jamais plus de 100 caractères et toujours un nom valide", () => {
    const name = suggestedRepoName("a".repeat(300));
    expect(name.length).toBeLessThanOrEqual(100);
    expect(isValidSpecRepoName(name)).toBe(true);
  });
});
