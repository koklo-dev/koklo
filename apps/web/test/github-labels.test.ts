import { installationCallbackOutcomeSchema } from "@koklo/contract";
import { describe, expect, it } from "vitest";
import {
  AUTHORIZATION_LABELS,
  INSTALLATION_STATUS_LABELS,
  RESULT_NOTICES,
} from "../src/lib/github-labels.ts";

/** design/screens/S-github.md §3 (statuts) et §4 (retour de GitHub) : un texte par statut et par résultat. */
describe("S-github — textes des statuts", () => {
  it("installation : un libellé par statut", () => {
    expect(INSTALLATION_STATUS_LABELS).toEqual({
      active: "Active",
      suspended: "Suspendue",
      deleted: "Désinstallée",
    });
  });

  it("autorisation : un libellé par état", () => {
    expect(AUTHORIZATION_LABELS).toEqual({
      active: "Autorisée",
      absent: "À autoriser",
      expired: "Autorisation expirée",
    });
  });
});

describe("S-github — résultats du retour de GitHub", () => {
  it("couvre exactement les 6 résultats du contrat", () => {
    expect(Object.keys(RESULT_NOTICES).sort()).toEqual(
      [...installationCallbackOutcomeSchema.options].sort(),
    );
  });

  it.each([
    ["installed", "Application GitHub installée", "status"],
    ["denied", "Installation non terminée", "alert"],
    ["invalid_state", "Ce retour depuis GitHub n'est plus valable", "alert"],
    ["already_linked", "Installation déjà utilisée", "alert"],
    ["not_owner", "Seul le propriétaire du compte peut faire cette liaison", "alert"],
    ["provider_error", "GitHub n'a pas répondu comme prévu", "alert"],
  ] as const)("%s : titre et ton", (outcome, title, tone) => {
    expect(RESULT_NOTICES[outcome].title).toBe(title);
    expect(RESULT_NOTICES[outcome].tone).toBe(tone);
    expect(RESULT_NOTICES[outcome].text.length).toBeGreaterThan(20);
  });

  it("le vocabulaire reste simple : ni OAuth, ni jeton, ni callback, ni SHA", () => {
    expect(RESULT_NOTICES.installed.title).not.toBe("");
    const all = JSON.stringify([INSTALLATION_STATUS_LABELS, AUTHORIZATION_LABELS, RESULT_NOTICES]);
    expect(all).not.toMatch(/oauth|jeton|callback|\bSHA\b|installation_id/i);
    expect(all.length).toBeGreaterThan(200);
  });
});
