import { describe, expect, it } from "vitest";
import { checkSpec } from "../src/index.ts";
import { patch, withFiles } from "./helpers.ts";
import {
  NFR_PATH,
  NFR_YAML,
  OPERATION_PATH,
  OPERATION_YAML,
  STACK_PATH,
  STACK_YAML,
  techFiles,
} from "./technical-helpers.ts";

/** TK-115 lot A (cas 2) : références du cahier technique, erreurs `TECH_UNKNOWN_*` et avertissements. */
const techIssues = (changes: Record<string, string | null> = {}) =>
  checkSpec(techFiles(changes)).issues.filter((i) => i.code.startsWith("TECH_"));
const found = (changes: Record<string, string | null>) =>
  techIssues(changes)
    .map((i) => [i.code, i.pointer, i.severity, i.rule])
    .sort();

describe("références du cahier technique", () => {
  it("un cahier cohérent : aucune erreur, aucun avertissement TECH_", () => {
    const report = checkSpec(techFiles());
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(techIssues()).toEqual([]);
  });

  it("choix : composant et décision inconnus en erreur, exigence inconnue en avertissement", () => {
    const content = STACK_YAML.replace("[C-api]", "[C-zzz]")
      .replace("[NFR-001]", "[NFR-999]")
      .replace("[ADR-001]", "[ADR-999]");
    expect(found({ [STACK_PATH]: content })).toEqual([
      ["TECH_UNKNOWN_COMPONENT", "/composants/0", "error", 4],
      ["TECH_UNKNOWN_DECISION", "/decisions/0", "error", 4],
      ["TECH_UNKNOWN_NFR", "/exigences/0", "warning", 7],
    ]);
  });

  it("opération : composant, règle (liste et erreurs) et fonctionnalité inconnus", () => {
    const content = OPERATION_YAML.replace("composant: C-api", "composant: C-zzz")
      .replace("regle: R-003", "regle: R-998")
      .replace("regles: [R-003]", "regles: [R-999]")
      .replace("sert: [F-001]", "sert: [F-999]");
    expect(found({ [OPERATION_PATH]: content })).toEqual([
      ["TECH_UNKNOWN_COMPONENT", "/composant", "error", 4],
      ["TECH_UNKNOWN_FEATURE", "/sert/0", "error", 4],
      ["TECH_UNKNOWN_RULE", "/erreurs/0/regle", "error", 4],
      ["TECH_UNKNOWN_RULE", "/regles/0", "error", 4],
    ]);
  });

  it("exigence : C-, ADR-, R- inconnus en erreur, ST- inconnu en avertissement", () => {
    const content = NFR_YAML.replace(
      "[C-api, ST-sms, ADR-001, R-003]",
      "[C-zzz, ST-zzz, ADR-999, R-999]",
    );
    expect(found({ [NFR_PATH]: content })).toEqual([
      ["TECH_UNKNOWN_COMPONENT", "/liens/0", "error", 4],
      ["TECH_UNKNOWN_DECISION", "/liens/2", "error", 4],
      ["TECH_UNKNOWN_RULE", "/liens/3", "error", 4],
      ["TECH_UNKNOWN_STACK", "/liens/1", "warning", 7],
    ]);
  });

  it("chaque issue nomme son entité et son fichier", () => {
    const content = STACK_YAML.replace("[C-api]", "[C-zzz]");
    expect(techIssues({ [STACK_PATH]: content })[0]).toMatchObject({
      path: STACK_PATH,
      entityId: "ST-sms",
      message: "Le composant C-zzz n'existe pas.",
    });
  });

  it("une opération compte comme endpoint : la citer n'est pas une référence inconnue", () => {
    const feature = patch("features/F-001-inscription.md", "E-auth-register", "avis.create");
    const operation = OPERATION_YAML.replace("creneau.listAvailable", "avis.create");
    const report = checkSpec(
      withFiles({
        "features/F-001-inscription.md": feature,
        "api/endpoints/avis.create.yaml": operation,
      }),
    );
    const codes = report.issues.map((i) => `${i.code} ${i.entityId}`);
    expect(codes.filter((c) => c.startsWith("R4_UNKNOWN_ENDPOINT F-001"))).toEqual([]);
    expect(codes).not.toContain("R7_ORPHAN_ENDPOINT avis.create");
  });
});
