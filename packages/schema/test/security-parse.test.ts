import { describe, expect, it } from "vitest";
import {
  docSectionPath,
  docSectionSlugOf,
  kindOf,
  parseSpecFiles,
  parseSummaryMarkdown,
  presentAtHead,
  specPathIndex,
} from "../src/index.ts";
import {
  ASVS_PATH,
  DATA_PATH,
  RIGHTS_PATH,
  SUMMARY_MD,
  SUMMARY_PATH,
  securityFiles,
  THREAT_PATH,
  THREAT_YAML,
} from "./security-helpers.ts";

/** TK-117 lot A (cas 1) : genres, lecture des fichiers `security/`, sections du dossier, index par chemins. */
describe("genres des fichiers de la Sécurité", () => {
  it("un genre par fichier ; les .feature restent hors modèle", () => {
    expect(
      [THREAT_PATH, DATA_PATH, RIGHTS_PATH, ASVS_PATH, SUMMARY_PATH].map((path) => kindOf(path)),
    ).toEqual(["threat", "security_data", "rights", "asvs", "security_summary"]);
    for (const path of [
      "quality/scenarios/abuse/SEC-T01.feature",
      "security/threats/.gitkeep",
      "security/dossier/01-objet.md",
      "security/threats/x/SEC-T01.yaml",
      "security/autre.yaml",
    ]) {
      expect(kindOf(path), path).toBeUndefined();
    }
  });

  it("lit les cinq fichiers sans erreur", () => {
    const { spec, issues } = parseSpecFiles(securityFiles());
    expect(issues).toEqual([]);
    expect(spec.threats.map((t) => t.value.id)).toEqual(["SEC-T01"]);
    expect(spec.threats[0]?.value.risque).toBe(
      "Quelqu'un récupère un lien.\nIl entre dans le compte.",
    );
    expect(spec.securityData[0]?.value.donnees).toHaveLength(3);
    expect(spec.rights[0]?.value.restrictions).toHaveLength(1);
    expect(spec.asvs[0]?.value.niveau).toBe(2);
    expect(spec.securitySummaries[0]?.value.acces).toBe(
      "Seul un administrateur supprime un compte.",
    );
  });

  it("identifiant en désaccord avec le fichier : menace exclue", () => {
    const content = THREAT_YAML.replace("SEC-T01", "SEC-T02");
    const { spec, issues } = parseSpecFiles(securityFiles({ [THREAT_PATH]: content }));
    expect(issues.map((i) => i.code)).toEqual(["STRUCT_ID_MISMATCH"]);
    expect(spec.threats).toEqual([]);
  });

  it("clé inconnue : fichier refusé, jamais à moitié lu", () => {
    const changes = { [DATA_PATH]: "donnees: []\nautre: 1\n" };
    const { spec, issues } = parseSpecFiles(securityFiles(changes));
    expect(issues.map((i) => i.code)).toEqual(["STRUCT_SCHEMA_VIOLATION"]);
    expect(spec.securityData).toEqual([]);
  });
});

describe("résumé client en Markdown", () => {
  const codesOf = (content: string) => {
    const result = parseSummaryMarkdown(SUMMARY_PATH, content);
    return result.ok ? [] : result.issues.map((i) => i.code);
  };

  it("section manquante, inconnue, répétée ou texte hors section : refusé", () => {
    expect(codesOf(SUMMARY_MD)).toEqual([]);
    for (const content of [
      SUMMARY_MD.replace("## Qui voit quoi", "## Autre titre"),
      SUMMARY_MD.replace("## Qui voit quoi\n\nSeul un administrateur supprime un compte.\n", ""),
      `${SUMMARY_MD}\n## Qui voit quoi\n\nEncore.\n`,
      `Introduction.\n\n${SUMMARY_MD}`,
      SUMMARY_MD.replace("Par un lien", "# Titre\n\nPar un lien"),
    ]) {
      expect(codesOf(content).length, content.slice(0, 60)).toBeGreaterThan(0);
    }
  });

  it("identifiant technique dans le texte : violation du schéma", () => {
    const content = SUMMARY_MD.replace("un compte.", "un compte (R-003).");
    expect(codesOf(content)).toEqual(["STRUCT_SCHEMA_VIOLATION"]);
  });

  it("fichier démesuré : refusé avant lecture", () => {
    expect(codesOf("a".repeat(1_048_577))).toEqual(["STRUCT_FILE_TOO_LARGE"]);
  });
});

describe("dossier de sécurité et index par chemins", () => {
  it("sections `security/dossier/NN-<slug>.md`", () => {
    expect(docSectionPath(2, "donnees", "security")).toBe("security/dossier/02-donnees.md");
    expect(docSectionSlugOf("security/dossier/02-donnees.md", "security")).toEqual({
      num: 2,
      slug: "donnees",
    });
    expect(docSectionSlugOf("security/dossier/02-donnees.md")).toBeUndefined();
  });

  it("menaces et sections indexées ; une section se cherche dans son livrable", () => {
    const index = specPathIndex([THREAT_PATH, "security/dossier/01-objet.md", DATA_PATH]);
    expect([...index.threats]).toEqual([["SEC-T01", THREAT_PATH]]);
    expect([...index.securityDocs.byId.keys()]).toEqual(["DOC-objet"]);
    const present = (kind: string, targetSpecId: string, deliverable?: string) =>
      presentAtHead(index, { kind, targetSpecId, payload: { deliverable } });
    expect(present("threat.update", "SEC-T01")).toBe(true);
    expect(present("threat.delete", "SEC-T02")).toBe(false);
    expect(present("doc.section.update", "DOC-objet", "security")).toBe(true);
    expect(present("doc.section.update", "DOC-objet", "technical")).toBe(false);
    expect(present("sensitive.update", "user.email")).toBeUndefined();
  });
});
