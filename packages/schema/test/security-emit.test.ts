import { describe, expect, it } from "vitest";
import {
  EmitSecurityError,
  emitAsvsYaml,
  emitRightsYaml,
  emitSecurityDataYaml,
  emitSummaryMarkdown,
  emitThreatYaml,
  parseSpecFiles,
} from "../src/index.ts";
import {
  ASVS_PATH,
  DATA_PATH,
  RIGHTS_PATH,
  SUMMARY_MD,
  SUMMARY_PATH,
  securityFiles,
  THREAT_PATH,
} from "./security-helpers.ts";

/** TK-117 lot A (cas 1) : émission canonique des fichiers `security/`, relecture identique. */
const read = (changes: Record<string, string> = {}) => {
  const { spec, issues } = parseSpecFiles(securityFiles(changes));
  expect(issues).toEqual([]);
  const first = <T>(list: readonly { value: T }[]): T => (list[0] as { value: T }).value;
  return {
    threat: first(spec.threats),
    data: first(spec.securityData),
    rights: first(spec.rights),
    asvs: first(spec.asvs),
    summary: first(spec.securitySummaries),
  };
};

const emitAll = (value: ReturnType<typeof read>) => ({
  [THREAT_PATH]: emitThreatYaml(value.threat),
  [DATA_PATH]: emitSecurityDataYaml(value.data),
  [RIGHTS_PATH]: emitRightsYaml(value.rights),
  [ASVS_PATH]: emitAsvsYaml(value.asvs),
  [SUMMARY_PATH]: emitSummaryMarkdown(value.summary),
});

describe("émission puis relecture", () => {
  it("rend les mêmes valeurs et une émission idempotente", () => {
    const source = read();
    const emitted = emitAll(source);
    const again = read(emitted);
    expect(again).toEqual(source);
    expect(emitAll(again)).toEqual(emitted);
    expect(emitted[SUMMARY_PATH]).toBe(SUMMARY_MD);
  });

  it("clés françaises dans l'ordre fixe, listes vides omises", () => {
    const yaml = emitThreatYaml({
      id: "SEC-T02",
      titre: "Titre : avec deux-points # et dièse",
      surfaces: ["api"],
      categorie: "abus",
      gravite: "faible",
      risque: "Un risque.",
      verification: { mode: "controle_ci" },
    });
    expect(yaml).toBe(
      'id: SEC-T02\ntitre: "Titre : avec deux-points # et dièse"\nsurfaces:\n  - api\ncategorie: abus\ngravite: faible\nrisque: Un risque.\nverification:\n  mode: controle_ci\n',
    );
  });

  it("aucune conservation inventée : une entrée sans durée n'en écrit pas", () => {
    const yaml = emitSecurityDataYaml({
      donnees: [{ donnee: "IP", champs: ["session.ip"], categorie: "contact" }],
    });
    expect(yaml).not.toContain("conservation");
  });

  it("fichier de données vide : liste vide relue", () => {
    expect(emitSecurityDataYaml({})).toBe("donnees: []\n");
    expect(emitRightsYaml({})).toBe("matrice: []\n");
  });
});

describe("refus à l'émission", () => {
  it("lève avec le pointeur de la valeur refusée, sans la recopier", () => {
    const failure = (run: () => string) => {
      try {
        run();
      } catch (error) {
        return error;
      }
      return undefined;
    };
    const threat = { ...read().threat, titre: "a\nb" };
    const refused = failure(() => emitThreatYaml(threat));
    expect(refused).toBeInstanceOf(EmitSecurityError);
    expect((refused as EmitSecurityError).path).toBe("/titre");
    const summary = { ...read().summary, incident: "Voir SEC-T01" };
    expect((failure(() => emitSummaryMarkdown(summary)) as EmitSecurityError).path).toBe(
      "/incident",
    );
  });

  it("résumé : aucune ligne ne peut ouvrir une autre section", () => {
    const summary = { ...read().summary, donnees: "Texte.\n## Qui voit quoi\nTout le monde." };
    expect(() => emitSummaryMarkdown(summary)).toThrow(EmitSecurityError);
  });
});
