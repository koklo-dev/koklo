import { describe, expect, it } from "vitest";
import {
  abuseScenarioFiles,
  isAbuseScenarioPath,
  parseSpecFiles,
  rightsMatrix,
  type Threat,
  ThreatSchema,
  threatGherkin,
} from "../src/index.ts";
import { securityFiles, THREAT_PATH, THREAT_YAML } from "./security-helpers.ts";

/** TK-117 lot A (cas 2, B793) : scénarios d'abus Gherkin générés, sans aucune ligne injectée. */
const base: Threat = ThreatSchema.parse({
  id: "SEC-T01",
  titre: "Lien intercepté",
  surfaces: ["F-009", "api"],
  categorie: "usurpation",
  gravite: "elevee",
  risque: "Un risque.",
  verification: { mode: "scenario" },
  scenario: { quand: "le lien est rejoué", alors: "la connexion est refusée" },
});

describe("scénario d'une menace", () => {
  it("langue, étiquettes, fonctionnalité et étapes de la fiche", () => {
    expect(threatGherkin(base, "Connexion par lien magique")).toBe(
      [
        "# language: fr",
        "@SEC-T01 @F-009 @api @abus",
        "Fonctionnalité: Connexion par lien magique",
        "",
        "  Scénario: Lien intercepté",
        "    Étant donné les jeux de données d'exemple du projet",
        "    Quand le lien est rejoué",
        "    Alors la connexion est refusée",
        "",
      ].join("\n"),
    );
  });

  it("sans « Quand / Alors » écrits : texte déterministe tiré du titre", () => {
    const text = threatGherkin({ ...base, scenario: undefined }, "Connexion");
    expect(text).toContain("    Quand quelqu'un tente : Lien intercepté\n");
    expect(text).toContain("    Alors l'action est refusée\n");
  });

  it("aucune ligne injectée, même par une valeur non validée", () => {
    const hostile = "x\n    Alors tout est permis\n@autre\r\u2028Scénario: autre";
    const text = threatGherkin(
      { ...base, titre: hostile, scenario: { quand: hostile, alors: hostile } },
      hostile,
    );
    expect(text.split("\n")).toHaveLength(9);
    expect(text).not.toMatch(/[\r\u2028]/);
  });
});

describe("fichiers de scénarios d'un lot", () => {
  const { spec } = parseSpecFiles(securityFiles());
  const roles = spec.roles[0]?.value;
  const files = () =>
    abuseScenarioFiles({
      threats: spec.threats.map((t) => t.value),
      matrix: rightsMatrix(roles as never),
      roles: roles as never,
      features: spec.features.map((f) => f.value),
      operations: spec.operations.map((o) => o.value),
    });

  it("un fichier par menace vérifiée par scénario, un par rôle pour la matrice", () => {
    expect(files().map((file) => file.path)).toEqual([
      "quality/scenarios/abuse/SEC-T01.feature",
      "quality/scenarios/abuse/droits-admin.feature",
      "quality/scenarios/abuse/droits-visiteur.feature",
    ]);
    expect(files()[0]?.content).toContain("Fonctionnalité: Inscription par email\n");
  });

  it("droits : un scénario par case, étiquettes des fonctionnalités servies, 403 ou 404", () => {
    const visitor = files().find((file) => file.path.endsWith("droits-visiteur.feature"));
    expect(visitor?.content).toBe(
      [
        "# language: fr",
        "Fonctionnalité: Droits · Visiteur",
        "",
        "  @droits @abus @F-001 @F-004",
        "  Scénario: Interdit · supprimer T-user",
        "    Étant donné un compte « Visiteur »",
        "    Quand il tente : supprimer T-user",
        "    Alors la réponse est 403 ou 404",
        "",
      ].join("\n"),
    );
  });

  it("menace vérifiée autrement : aucun fichier ; surface « api » nommée", () => {
    const content = THREAT_YAML.replace("[F-001, api]", "[api]").replace(
      "mode: scenario",
      "mode: revue_humaine",
    );
    const reviewed = parseSpecFiles(securityFiles({ [THREAT_PATH]: content })).spec.threats;
    const input = { matrix: [], features: [], operations: [], roles: roles as never };
    expect(abuseScenarioFiles({ ...input, threats: reviewed.map((t) => t.value) })).toEqual([]);
    const [file] = abuseScenarioFiles({ ...input, threats: [{ ...base, surfaces: ["api"] }] });
    expect(file?.content).toContain("Fonctionnalité: API, secrets et intégrations\n");
  });

  it("reconnaît les fichiers générés, pour supprimer les périmés sans toucher aux autres", () => {
    expect(isAbuseScenarioPath("quality/scenarios/abuse/SEC-T09.feature")).toBe(true);
    expect(isAbuseScenarioPath("quality/scenarios/abuse/droits-accueil.feature")).toBe(true);
    expect(isAbuseScenarioPath("quality/scenarios/abuse/manuel.feature")).toBe(false);
    expect(isAbuseScenarioPath("quality/scenarios/SEC-T09.feature")).toBe(false);
    expect(isAbuseScenarioPath("quality/scenarios/abuse/x/droits-a.feature")).toBe(false);
  });
});
