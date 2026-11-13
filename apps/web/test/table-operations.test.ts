import { describe, expect, it } from "vitest";
import {
  EMPTY_TABLE,
  parseFieldLines,
  tableIssues,
  tableOperationOf,
  tableValuesOf,
} from "../src/lib/table-operations.ts";

/** TK-107 lot C : saisie, contrôle et opérations du formulaire Table (passation 11 §3, B385). */
const FILLED = {
  ...EMPTY_TABLE,
  name: "Réservation",
  zone: "Prise de rendez-vous",
  description: "Un client, un créneau.",
  fieldsText:
    "id · uuid · clé primaire\nclient_id · ref(T-client) · obligatoire\nstatut · enum · confirmee, annulee",
  personal: "no" as const,
  sources: ["F-001", "R-004"],
};

describe("parseFieldLines", () => {
  it("lit nom · type · contrainte : clé primaire, valeurs d'enum, règle entre parenthèses", () => {
    expect(
      parseFieldLines(
        "id · uuid · clé primaire\nstatut · enum · confirmee, annulee\ncreneau_id · ref(T-creneau) · unique (R-001)\nnom · texte(80)\nemail · texte(120) · obligatoire · données personnelles",
      ),
    ).toEqual({
      fields: [
        { name: "id", type: "uuid", primaryKey: true },
        { name: "statut", type: "enum", values: ["confirmee", "annulee"] },
        { name: "creneau_id", type: "ref(T-creneau)", constraints: "unique", rule: "R-001" },
        { name: "nom", type: "texte(80)" },
        { name: "email", type: "texte(120)", constraints: "obligatoire", personalData: true },
      ],
      errors: [],
    });
  });

  it("signale un nom invalide, un type inconnu, un enum sans valeurs et un doublon, avec le numéro de ligne", () => {
    const { errors } = parseFieldLines("Nom · uuid\nx · chaine\ny · enum\nz · uuid\nz · entier");
    expect(errors).toEqual([
      "Ligne 1 : « Nom » n'est pas un nom de champ (minuscules, chiffres et _).",
      "Ligne 2 : le type « chaine » n'existe pas (uuid, texte(n), entier, decimal, booleen, horodatage, date, enum, json, ref(T-…)).",
      "Ligne 3 : un champ enum donne ses valeurs, séparées par des virgules.",
      "Ligne 5 : le champ « z » existe déjà.",
    ]);
  });

  it("ignore les lignes vides ; une ligne sans type est signalée", () => {
    expect(parseFieldLines("\n  \nid · uuid\n").fields).toHaveLength(1);
    expect(parseFieldLines("id").errors[0]).toContain("Ligne 1");
  });
});

describe("tableIssues", () => {
  it("un formulaire complet n'a aucun point à corriger", () => {
    expect(tableIssues(FILLED)).toEqual([]);
  });

  it("nom, zone et champs sont obligatoires", () => {
    expect(tableIssues(EMPTY_TABLE).map((i) => i.field)).toEqual(["name", "zone", "fields"]);
  });

  it("une ligne de champ invalide remonte sur le champ « fields », avec son message", () => {
    const issues = tableIssues({ ...FILLED, fieldsText: "id · chaine" });
    expect(issues).toEqual([
      expect.objectContaining({ field: "fields", message: expect.stringContaining("Ligne 1") }),
    ]);
  });

  it("zone au plus 80 caractères, nom au plus 120", () => {
    expect(tableIssues({ ...FILLED, zone: "z".repeat(81) })[0]?.field).toBe("zone");
    expect(tableIssues({ ...FILLED, name: "n".repeat(121) })[0]?.field).toBe("name");
  });

  it("« Oui » exige un champ marqué données personnelles, « Non » n'en admet aucun", () => {
    expect(tableIssues({ ...FILLED, personal: "yes" }).map((i) => i.field)).toEqual(["personal"]);
    const flagged = {
      ...FILLED,
      fieldsText: "id · uuid · clé primaire\nemail · texte(120) · données personnelles",
    };
    expect(tableIssues({ ...flagged, personal: "no" }).map((i) => i.field)).toEqual(["personal"]);
    expect(tableIssues({ ...flagged, personal: "yes" })).toEqual([]);
  });

  it("une justification qui n'est ni F-nnn ni R-nnn est refusée", () => {
    expect(tableIssues({ ...FILLED, sources: ["X-1"] }).map((i) => i.field)).toEqual(["sources"]);
  });
});

describe("tableOperationOf", () => {
  it("création : table.create avec les champs lus, la description et les justifications", () => {
    expect(tableOperationOf(FILLED)).toEqual({
      kind: "table.create",
      name: "Réservation",
      zone: "Prise de rendez-vous",
      description: "Un client, un créneau.",
      sources: ["F-001", "R-004"],
      fields: [
        { name: "id", type: "uuid", primaryKey: true },
        { name: "client_id", type: "ref(T-client)", constraints: "obligatoire" },
        { name: "statut", type: "enum", values: ["confirmee", "annulee"] },
      ],
    });
  });

  it("création sans description ni justification : ces clés sont absentes", () => {
    const op = tableOperationOf({ ...FILLED, description: "", sources: [] });
    expect(op).not.toHaveProperty("description");
    expect(op).not.toHaveProperty("sources");
  });

  it("modification : table.update avec les seuls champs changés ; aucune modification = null", () => {
    const edit = { specId: "T-reservation", baseline: FILLED };
    expect(tableOperationOf(FILLED, edit)).toBeNull();
    expect(tableOperationOf({ ...FILLED, zone: "Paiement" }, edit)).toEqual({
      kind: "table.update",
      specId: "T-reservation",
      zone: "Paiement",
    });
  });

  it("modification : un retrait de description ou de justification est envoyé (liste vide, texte vide)", () => {
    const edit = { specId: "T-reservation", baseline: FILLED };
    expect(tableOperationOf({ ...FILLED, sources: [] }, edit)).toMatchObject({ sources: [] });
    expect(tableOperationOf({ ...FILLED, description: "" }, edit)).toMatchObject({
      description: "",
    });
  });
});

describe("tableValuesOf", () => {
  it("relit une fiche en lignes de champs, Oui si un champ est une donnée personnelle", () => {
    const values = tableValuesOf({
      specId: "T-client",
      name: "Client",
      description: "",
      zone: "Clients",
      sources: ["F-003"],
      fields: [
        { name: "id", type: "uuid", primaryKey: true, personalData: false },
        {
          name: "statut",
          type: "enum",
          primaryKey: false,
          values: ["a", "b"],
          personalData: false,
        },
        {
          name: "tel",
          type: "texte(20)",
          primaryKey: false,
          constraints: "unique",
          rule: "R-002",
          personalData: true,
        },
      ],
      relations: [],
      filePath: "data/tables/client.yaml",
      commitSha: "a".repeat(40),
    });
    expect(values.fieldsText).toBe(
      "id · uuid · clé primaire\nstatut · enum · a, b\ntel · texte(20) · unique (R-002) · données personnelles",
    );
    expect(values).toMatchObject({
      name: "Client",
      zone: "Clients",
      personal: "yes",
      sources: ["F-003"],
    });
    expect(parseFieldLines(values.fieldsText).errors).toEqual([]);
  });
});
