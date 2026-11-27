import { describe, expect, it } from "vitest";
import { checkSpec } from "../src/index.ts";
import {
  ASVS_PATH,
  ASVS_YAML,
  DATA_PATH,
  DATA_YAML,
  RIGHTS_PATH,
  RIGHTS_YAML,
  securityFiles,
  THREAT_PATH,
  THREAT_YAML,
} from "./security-helpers.ts";

/** TK-117 lot A (cas 1) : références de la Sécurité, erreurs `SEC_UNKNOWN_*` et avertissements. */
const securityIssues = (changes: Record<string, string | null> = {}) =>
  checkSpec(securityFiles(changes)).issues.filter((i) => i.code.startsWith("SEC_"));
const found = (changes: Record<string, string | null>) =>
  securityIssues(changes)
    .map((i) => [i.code, i.pointer, i.severity, i.rule])
    .sort();

describe("références de la Sécurité", () => {
  it("un livrable cohérent : aucune erreur, aucun avertissement SEC_", () => {
    const report = checkSpec(securityFiles());
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(securityIssues()).toEqual([]);
  });

  it("menace : fonctionnalité et rôle inconnus en erreur, autres liens en avertissement", () => {
    const content = THREAT_YAML.replace("[F-001, api]", "[F-999, api]").replace(
      /^liens: .*$/m,
      "liens: [absent.operation, T-zzz, user.disparu, RL-zzz, NFR-999, R-999]",
    );
    expect(found({ [THREAT_PATH]: content })).toEqual([
      ["SEC_UNKNOWN_FEATURE", "/surfaces/0", "error", 4],
      ["SEC_UNKNOWN_FIELD", "/liens/2", "warning", 7],
      ["SEC_UNKNOWN_LINK", "/liens/0", "warning", 7],
      ["SEC_UNKNOWN_LINK", "/liens/1", "warning", 7],
      ["SEC_UNKNOWN_LINK", "/liens/4", "warning", 7],
      ["SEC_UNKNOWN_LINK", "/liens/5", "warning", 7],
      ["SEC_UNKNOWN_ROLE", "/liens/3", "error", 4],
    ]);
  });

  it("données : un champ disparu du modèle n'est qu'un avertissement", () => {
    const content = DATA_YAML.replace("[user.email]", "[user.disparu]");
    expect(found({ [DATA_PATH]: content })).toEqual([
      ["SEC_UNKNOWN_FIELD", "/donnees/0/champs/0", "warning", 7],
    ]);
  });

  it("restrictions : rôle inconnu en erreur, permission inconnue en avertissement", () => {
    const content = RIGHTS_YAML.replace(
      "{ role: RL-admin, permission: PM-compte.supprimer,",
      "{ role: RL-zzz, permission: PM-compte.zzz,",
    );
    expect(found({ [RIGHTS_PATH]: content })).toEqual([
      ["SEC_UNKNOWN_LINK", "/restrictions/0/permission", "warning", 7],
      ["SEC_UNKNOWN_ROLE", "/restrictions/0/role", "error", 4],
    ]);
  });

  it("ASVS : fonctionnalité inconnue en erreur, menace inconnue en avertissement", () => {
    const content = ASVS_YAML.replace("[F-001, SEC-T01]", "[F-999, SEC-T99]");
    expect(found({ [ASVS_PATH]: content })).toEqual([
      ["SEC_UNKNOWN_FEATURE", "/exigences/0/liens/0", "error", 4],
      ["SEC_UNKNOWN_LINK", "/exigences/0/liens/1", "warning", 7],
    ]);
  });

  it("le message nomme la référence inconnue", () => {
    const content = THREAT_YAML.replace("[F-001, api]", "[F-999]");
    expect(securityIssues({ [THREAT_PATH]: content })[0]).toMatchObject({
      entityId: "SEC-T01",
      path: THREAT_PATH,
      message: "La fonctionnalité F-999 n'existe pas.",
    });
  });
});
