import { describe, expect, it } from "vitest";
import {
  EndpointSchema,
  FeatureSchema,
  ProjectManifestSchema,
  RelationSchema,
  ScreenSchema,
  TableSchema,
  TestScenarioSchema,
} from "../src/index.ts";

const feature = {
  id: "F-001",
  titre: "Inscription par email",
  statut: "specifiee",
  priorite: "must",
  tables: ["T-user"],
  endpoints: ["E-auth-register"],
  ecrans: ["S-register"],
  roles: ["RL-visiteur"],
  regles: ["R-003"],
  nfr: ["NFR-001"],
  description: "L'utilisateur crée un compte.",
  criteres: [
    {
      id: "AC-1",
      titre: "Email déjà utilisé",
      etapes: [
        { type: "etant_donne", texte: "un compte existant" },
        { type: "quand", texte: "un visiteur s'inscrit" },
        { type: "alors", texte: "l'inscription est refusée" },
        { type: "et", texte: "un message s'affiche" },
      ],
    },
  ],
};
const project = {
  projet: "civinat",
  organisation: "acme",
  spec_version: 1,
  extends: ["org:design-library@^2"],
  repos: [{ role: "front", fournisseur: "github", url: "acme/civinat-web" }],
};
const table = {
  id: "T-user",
  champs: [{ nom: "email", type: "text", nullable: false, unique: true }],
};
const relation = { from: "T-session.user_id", to: "T-user.id", cardinalite: "n-1" };
const endpoint = {
  id: "E-auth-register",
  methode: "POST",
  chemin: "/auth/register",
  entree: { type: "object" },
  sortie: { type: "object" },
  erreurs: [{ statut: 409, code: "EMAIL_DEJA_UTILISE" }],
  tables: ["T-user"],
};
const screen = {
  id: "S-register",
  features: ["F-001"],
  viewport: ["mobile"],
  arbre: {
    composant: "C-page",
    enfants: [
      {
        id: "n-email",
        composant: "C-input",
        props: { label: "Email" },
        annotations: [{ feature: "F-001", critere: "AC-1", donnee: "T-user.email" }],
      },
    ],
  },
  etats: ["vide"],
};
const scenario = {
  feature: "F-001",
  type: "e2e",
  fichier: "e2e/inscription.spec.ts",
  criteres: ["AC-1"],
};

type Case = {
  name: string;
  schema: {
    safeParse: (v: unknown) => {
      success: boolean;
      error?: { issues: { path: PropertyKey[]; message: string }[] };
    };
  };
  valid: Record<string, unknown>;
};
const cases: Case[] = [
  { name: "ProjectManifest", schema: ProjectManifestSchema, valid: project },
  { name: "Feature", schema: FeatureSchema, valid: feature },
  { name: "Table", schema: TableSchema, valid: table },
  { name: "Relation", schema: RelationSchema, valid: relation },
  { name: "Endpoint", schema: EndpointSchema, valid: endpoint },
  { name: "Screen", schema: ScreenSchema, valid: screen },
  { name: "TestScenario", schema: TestScenarioSchema, valid: scenario },
];

describe.each(cases)("CA1 $name", ({ schema, valid }) => {
  it("accepte l'exemple valide", () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it("refuse une clé inconnue à la racine", () => {
    const result = schema.safeParse({ ...valid, inconnue: 1 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("inconnue");
  });

  it("refuse chaque champ requis manquant avec son chemin", () => {
    for (const key of Object.keys(valid)) {
      const { [key]: _removed, ...rest } = valid;
      const result = schema.safeParse(rest);
      // Un champ optionnel ou à défaut peut manquer ; sinon l'erreur localise la clé.
      if (!result.success) {
        expect(result.error?.issues.some((i) => i.path[0] === key)).toBe(true);
      }
    }
  });
});

describe("CA1 champs requis (liste exacte)", () => {
  const required = (schema: Case["schema"], valid: Record<string, unknown>) =>
    Object.keys(valid)
      .filter((key) => {
        const { [key]: _r, ...rest } = valid;
        return !schema.safeParse(rest).success;
      })
      .sort();

  it("Feature : id, titre, statut, priorite, description, criteres", () => {
    expect(required(FeatureSchema, feature)).toEqual([
      "criteres",
      "description",
      "id",
      "priorite",
      "statut",
      "titre",
    ]);
  });
  it("ProjectManifest : projet, organisation, spec_version", () => {
    const req = required(ProjectManifestSchema, project);
    for (const key of ["organisation", "projet", "spec_version"]) expect(req).toContain(key);
  });
  it("Endpoint : id, methode, chemin", () => {
    const req = required(EndpointSchema, endpoint);
    for (const key of ["chemin", "id", "methode"]) expect(req).toContain(key);
  });
});

describe("CA1 identifiants et énumérations", () => {
  it.each(["F-1", "f-001", "F-001-x", "001", ""])("Feature refuse l'id %j", (id) => {
    const result = FeatureSchema.safeParse({ ...feature, id });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["id"]);
  });

  it("Feature accepte F-1234 (3 chiffres ou plus)", () => {
    expect(FeatureSchema.safeParse({ ...feature, id: "F-1234" }).success).toBe(true);
  });

  it.each(["brouillon", "specifiee", "implementee", "adoptee"])(
    "Feature accepte le statut %s",
    (statut) => {
      expect(FeatureSchema.safeParse({ ...feature, statut }).success).toBe(true);
    },
  );

  it("Feature refuse un statut hors énumération, avec le chemin", () => {
    const result = FeatureSchema.safeParse({ ...feature, statut: "terminee" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["statut"]);
  });

  it("Feature refuse une priorité hors énumération", () => {
    expect(FeatureSchema.safeParse({ ...feature, priorite: "urgent" }).success).toBe(false);
  });

  it("Feature refuse un lien mal formé dans tables, endpoints et ecrans", () => {
    expect(FeatureSchema.safeParse({ ...feature, tables: ["user"] }).success).toBe(false);
    expect(FeatureSchema.safeParse({ ...feature, endpoints: ["T-user"] }).success).toBe(false);
    expect(FeatureSchema.safeParse({ ...feature, ecrans: ["register"] }).success).toBe(false);
  });

  it("Feature : les listes de liens valent [] par défaut", () => {
    const { tables, endpoints, ecrans, roles, regles, nfr, ...minimal } = feature;
    const result = FeatureSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    expect(result.success && result.data.tables).toEqual([]);
  });

  it("Critère : id AC-n obligatoire", () => {
    const criteres = [{ ...feature.criteres[0], id: "AC-x" }];
    expect(FeatureSchema.safeParse({ ...feature, criteres }).success).toBe(false);
  });

  it("Critère : type d'étape hors étant_donne/quand/alors/et refusé", () => {
    const criteres = [{ ...feature.criteres[0], etapes: [{ type: "puis", texte: "x" }] }];
    expect(FeatureSchema.safeParse({ ...feature, criteres }).success).toBe(false);
  });

  it('ProjectManifest refuse spec_version 2 et la chaîne "1"', () => {
    const v2 = ProjectManifestSchema.safeParse({ ...project, spec_version: 2 });
    expect(v2.success).toBe(false);
    expect(v2.error?.issues[0]?.path).toEqual(["spec_version"]);
    expect(ProjectManifestSchema.safeParse({ ...project, spec_version: "1" }).success).toBe(false);
  });

  it("ProjectManifest : extends et repos valent [] par défaut", () => {
    const result = ProjectManifestSchema.safeParse({
      projet: "p",
      organisation: "o",
      spec_version: 1,
    });
    expect(result.success).toBe(true);
  });

  it("Table : id T-slug, type de champ énuméré", () => {
    expect(TableSchema.safeParse({ ...table, id: "user" }).success).toBe(false);
    expect(TableSchema.safeParse({ ...table, id: "T-User" }).success).toBe(false);
    const champs = [{ nom: "x", type: "varchar", nullable: false, unique: false }];
    expect(TableSchema.safeParse({ ...table, champs }).success).toBe(false);
  });

  it("Table : refuse une clé inconnue dans un champ, avec son chemin", () => {
    const champs = [{ ...table.champs[0], defaut: 1 }];
    const result = TableSchema.safeParse({ ...table, champs });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["champs", 0]);
  });

  it("Relation : from et to au format T-x.champ, cardinalité énumérée", () => {
    expect(RelationSchema.safeParse({ ...relation, from: "T-session" }).success).toBe(false);
    expect(RelationSchema.safeParse({ ...relation, cardinalite: "plusieurs" }).success).toBe(false);
    for (const cardinalite of ["1-1", "1-n", "n-1", "n-n"]) {
      expect(RelationSchema.safeParse({ ...relation, cardinalite }).success).toBe(true);
    }
  });

  it("Endpoint : méthode HTTP énumérée, chemin commençant par /", () => {
    expect(EndpointSchema.safeParse({ ...endpoint, methode: "FETCH" }).success).toBe(false);
    expect(EndpointSchema.safeParse({ ...endpoint, chemin: "auth/register" }).success).toBe(false);
    for (const methode of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      expect(EndpointSchema.safeParse({ ...endpoint, methode }).success).toBe(true);
    }
  });

  it("Endpoint : id E-slug", () => {
    expect(EndpointSchema.safeParse({ ...endpoint, id: "auth-register" }).success).toBe(false);
  });

  it("Screen : id S-slug ; le nœud accepte les clés inconnues, pas l'écran ni l'annotation", () => {
    expect(ScreenSchema.safeParse({ ...screen, id: "register" }).success).toBe(false);
    const enfants = [{ composant: "C-input", interactions: [{ sur: "clic" }], props: { a: 1 } }];
    expect(
      ScreenSchema.safeParse({ ...screen, arbre: { composant: "C-page", enfants } }).success,
    ).toBe(true);
    const annotations = [{ feature: "F-001", extra: true }];
    const bad = ScreenSchema.safeParse({ ...screen, arbre: { composant: "C-page", annotations } });
    expect(bad.success).toBe(false);
  });

  it("Screen : accepte l'exemple S-register de l'annexe A (arbre sans id racine)", () => {
    expect(ScreenSchema.safeParse(screen).success).toBe(true);
  });

  it("Screen : la donnée d'une annotation est une chaîne libre (R4_MALFORMED_DATA_REF est une règle, pas un schéma)", () => {
    const annotations = [{ feature: "F-001", donnee: "user.email" }];
    expect(
      ScreenSchema.safeParse({ ...screen, arbre: { composant: "C-page", annotations } }).success,
    ).toBe(true);
  });

  it("TestScenario : type énuméré, critères AC-n", () => {
    expect(TestScenarioSchema.safeParse({ ...scenario, type: "unitaire" }).success).toBe(false);
    expect(TestScenarioSchema.safeParse({ ...scenario, criteres: ["1"] }).success).toBe(false);
    for (const type of ["e2e", "contrat", "visuel"]) {
      expect(TestScenarioSchema.safeParse({ ...scenario, type }).success).toBe(true);
    }
  });
});
