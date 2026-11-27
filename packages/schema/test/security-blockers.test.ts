import { describe, expect, it } from "vitest";
import {
  blockerReasonOf,
  expandDataFields,
  modelFields,
  parseSpecFiles,
  securityBlockers,
  threatStateOf,
} from "../src/index.ts";
import { validFiles } from "./helpers.ts";
import {
  DATA_PATH,
  DATA_YAML,
  securityFiles,
  THREAT_PATH,
  THREAT_YAML,
} from "./security-helpers.ts";

/** TK-117 lot A (cas 3, B795) : état d'une menace, champs non classés, blocages de la validation. */
const blockersOf = (changes: Record<string, string | null> = {}) => {
  const { spec } = parseSpecFiles(securityFiles(changes));
  return securityBlockers({
    threats: spec.threats.map((t) => t.value),
    data: spec.securityData[0]?.value,
    tables: spec.tables.map((t) => t.value),
  });
};
const NO_COUNTER = THREAT_YAML.replace("parades:\n  - Lien à usage unique.\n", "");

describe("menaces", () => {
  it("sans parade : à traiter ; avec : traitée", () => {
    expect(threatStateOf({ parades: [] })).toBe("todo");
    expect(threatStateOf({ parades: ["x"] })).toBe("ok");
  });

  it("élevée sans parade bloque ; moyenne sans parade ne bloque pas", () => {
    expect(blockersOf({ [THREAT_PATH]: NO_COUNTER }).openHighThreats).toEqual(["SEC-T01"]);
    const medium = NO_COUNTER.replace("gravite: elevee", "gravite: moyenne");
    expect(blockersOf({ [THREAT_PATH]: medium }).openHighThreats).toEqual([]);
  });
});

describe("données", () => {
  it("un livrable complet ne bloque pas", () => {
    const blockers = blockersOf();
    expect(blockers).toEqual({ openHighThreats: [], unclassified: [], undecided: [] });
    expect(blockerReasonOf(blockers)).toBeUndefined();
  });

  it("un champ nouveau dans une table n'est pas couvert", () => {
    const content = DATA_YAML.replace("session.id, session.user_id", "session.id");
    expect(blockersOf({ [DATA_PATH]: content }).unclassified).toEqual(["session.user_id"]);
  });

  it("sans fichier de données, tout champ est à classer", () => {
    expect(blockersOf({ [DATA_PATH]: null }).unclassified).toHaveLength(5);
  });

  it("personnelle, contact ou sensible sans conservation : à décider ; suggestion non comptée", () => {
    for (const category of ["personnelle", "contact", "sensible"]) {
      const content = DATA_YAML.replace("categorie: contact", `categorie: ${category}`).replace(
        "    conservation: 3 ans après la dernière connexion\n",
        "    conservation_proposee: 3 ans\n",
      );
      expect(blockersOf({ [DATA_PATH]: content }).undecided, category).toEqual(["user.email"]);
    }
  });

  it("secret et technique : la catégorie suffit", () => {
    expect(blockersOf().undecided).toEqual([]);
  });

  it("modèle : champs des tables v1 et v2", () => {
    const { spec } = parseSpecFiles(validFiles());
    const fields = modelFields(spec.tables.map((t) => t.value));
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.every((field) => /^[a-z0-9-]+\.[a-z_][a-z0-9_]*$/.test(field))).toBe(true);
    const tables = [{ id: "T-user", champs: [{ nom: "id" }, { nom: "email" }] }];
    expect(modelFields(tables)).toEqual(["user.id", "user.email"]);
  });

  it("une table saisie seule est développée en ses champs du moment (B795)", () => {
    const tables = [{ id: "T-user", champs: [{ nom: "id" }, { nom: "email" }] }];
    expect(expandDataFields(["user", "user.email", "autre.x", "inconnue"], tables)).toEqual([
      "user.id",
      "user.email",
      "autre.x",
      "inconnue",
    ]);
  });
});

describe("motif du refus de validation (B804)", () => {
  const none = { openHighThreats: [], unclassified: [], undecided: [] };
  it("les menaces d'abord, puis les données", () => {
    expect(blockerReasonOf({ ...none, openHighThreats: ["SEC-T08"], unclassified: ["a.b"] })).toBe(
      "threats_open",
    );
    expect(blockerReasonOf({ ...none, unclassified: ["a.b"] })).toBe("data_unclassified");
    expect(blockerReasonOf({ ...none, undecided: ["a.b"] })).toBe("data_unclassified");
  });
});
