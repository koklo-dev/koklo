import { describe, expect, it } from "vitest";
import {
  EnvironmentsFileSchema,
  NfrSchema,
  OperationSchema,
  PATTERNS,
  StackSchema,
  stackLayerOf,
} from "../src/index.ts";

/** TK-115 lot A (fiche §3, cas 1) : formats `tech/stack`, `api/endpoints`, `nfr`, `tech/environments.yaml`. */
const STACK = {
  id: "ST-sms",
  couche: "externes",
  role: "Fournisseur SMS",
  statut: "a_trancher",
  options: ["Brevo", "Twilio"],
  pourquoi: "À comparer.",
};
const OPERATION = {
  id: "creneau.listAvailable",
  type: "lecture",
  zone: "Prise de rendez-vous",
  composant: "C-api",
  permission: "public",
  resume: "Liste les créneaux libres.",
};
const NFR = {
  id: "NFR-001",
  categorie: "performance",
  titre: "Temps de réponse",
  cible: "p95 < 300 ms",
  enonce: "Les réservations répondent vite.",
  verification: { mode: "a_definir" },
};
const ENVIRONMENT = {
  id: "ENV-recette",
  nom: "Recette",
  adresse: "recette.atelier-lumiere.fr",
  hebergement: "Scaleway · Paris",
  base: "PostgreSQL géré",
  donnees: "jeux_exemple",
};

const refused = (schema: { safeParse(v: unknown): { success: boolean } }, value: unknown) =>
  !schema.safeParse(value).success;
const pointers = (value: unknown) => {
  const result = StackSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((i) => i.path.join("/"));
};

describe("identifiants du lot Technique", () => {
  it("ST- et ENV- sont des slugs ; NFR- reste libre", () => {
    expect(PATTERNS.stack.test("ST-sms")).toBe(true);
    expect(PATTERNS.stack.test("ST-Sms")).toBe(false);
    expect(PATTERNS.environment.test("ENV-recette")).toBe(true);
    expect(PATTERNS.environment.test("ENV-")).toBe(false);
    expect(PATTERNS.nfr.test("NFR-001")).toBe(true);
    expect(PATTERNS.nfr.test("NFR-perf")).toBe(true);
  });

  it("zone.verbe accepte la camelCase et _ ; l'ancien E- reste lu comme endpoint", () => {
    for (const id of ["creneau.listAvailable", "liste_attente.list", "auth.creer", "E-auth"]) {
      expect(PATTERNS.endpoint.test(id), id).toBe(true);
    }
    for (const id of ["Creneau.list", "creneau", "creneau.list.all", "creneau list.x"]) {
      expect(PATTERNS.endpoint.test(id), id).toBe(false);
    }
    expect(PATTERNS.operation.test("creneau.listAvailable")).toBe(true);
    expect(PATTERNS.operation.test("E-auth")).toBe(false);
  });
});

describe("choix technique ST-", () => {
  it("à trancher sans choix : valide, listes vides par défaut", () => {
    expect(StackSchema.parse(STACK)).toMatchObject({
      composants: [],
      criteres: [],
      exigences: [],
      decisions: [],
    });
  });

  it("choisi exige un choix ; à trancher n'en porte aucun", () => {
    expect(pointers({ ...STACK, statut: "choisi" })).toContain("choix");
    expect(pointers({ ...STACK, choix: "Brevo" })).toContain("choix");
    const chosen = { ...STACK, statut: "choisi", choix: "Next.js 15 · React 19" };
    expect(StackSchema.safeParse(chosen).success).toBe(true);
  });

  it("deux options au moins, distinctes ; une valeur de critère par option", () => {
    expect(refused(StackSchema, { ...STACK, options: ["Brevo"] })).toBe(true);
    expect(pointers({ ...STACK, options: ["Brevo", "Brevo"] })).toContain("options");
    const criteres = [{ nom: "Prix", valeurs: ["≈ 0,04 €"] }];
    expect(pointers({ ...STACK, criteres })).toContain("criteres/0/valeurs");
    const ok = [{ nom: "Prix", estimation: true, valeurs: ["≈ 0,04 €", "—"] }];
    expect(StackSchema.safeParse({ ...STACK, criteres: ok }).success).toBe(true);
  });

  it("l'option recommandée est l'une des options", () => {
    expect(pointers({ ...STACK, recommande: "OVHcloud" })).toContain("recommande");
    expect(StackSchema.safeParse({ ...STACK, recommande: "Twilio" }).success).toBe(true);
  });

  it("clé inconnue, couche, icône et références mal formées refusées", () => {
    for (const patch of [
      { pour: ["C-api"] },
      { couche: "reseau" },
      { icone: "bolt" },
      { composants: ["api"] },
      { exigences: ["R-001"] },
      { decisions: ["ADR-1"] },
    ]) {
      expect(refused(StackSchema, { ...STACK, ...patch }), JSON.stringify(patch)).toBe(true);
    }
  });

  it("la couche se déduit du premier composant", () => {
    expect(stackLayerOf("app")).toBe("applications");
    expect(stackLayerOf("service")).toBe("services");
    expect(stackLayerOf("store")).toBe("donnees");
    expect(stackLayerOf("queue")).toBe("donnees");
    expect(stackLayerOf("ext")).toBe("externes");
    expect(stackLayerOf(undefined)).toBe("exploitation");
  });
});

describe("opération zone.verbe", () => {
  it("valide : champs minimaux, listes et objets vides par défaut", () => {
    expect(OperationSchema.parse(OPERATION)).toMatchObject({
      entree: {},
      sortie: {},
      erreurs: [],
      regles: [],
      sert: [],
    });
  });

  it("permission : public, interne ou PM-", () => {
    for (const permission of ["public", "interne", "PM-reservation.creer"]) {
      expect(OperationSchema.safeParse({ ...OPERATION, permission }).success, permission).toBe(
        true,
      );
    }
    expect(refused(OperationSchema, { ...OPERATION, permission: "admin" })).toBe(true);
  });

  it("identifiant E-, type inconnu, champ d'entrée sans type et clé inconnue refusés", () => {
    for (const patch of [
      { id: "E-auth" },
      { type: "mutation" },
      { entree: { a: { contrainte: "x" } } },
      { entree: { a: { type: "uuid", note: "x" } } },
      { sortie: { a: { type: "uuid", contrainte: "x" } } },
      { erreurs: [{ code: "X" }] },
      { methode: "GET" },
      { tables: [] },
    ]) {
      expect(refused(OperationSchema, { ...OPERATION, ...patch }), JSON.stringify(patch)).toBe(
        true,
      );
    }
  });
});

describe("exigence NFR-", () => {
  it("valide ; liens C-, ST-, ADR-, R- seulement", () => {
    const liens = ["C-api", "ST-sms", "ADR-001", "R-003"];
    expect(NfrSchema.safeParse({ ...NFR, liens }).success).toBe(true);
    expect(refused(NfrSchema, { ...NFR, liens: ["F-001"] })).toBe(true);
  });

  it("catégorie et mode de vérification fermés, clé inconnue refusée", () => {
    for (const patch of [
      { categorie: "autre" },
      { verification: { mode: "audit" } },
      { verification: { mode: "manuel", par: "x" } },
      { statut: "couverte" },
    ]) {
      expect(refused(NfrSchema, { ...NFR, ...patch }), JSON.stringify(patch)).toBe(true);
    }
  });
});

describe("environnements", () => {
  const file = (extra: object) => ({ environnements: [ENVIRONMENT], ...extra });

  it("fichier vide ou complet valide", () => {
    expect(EnvironmentsFileSchema.parse({})).toEqual({
      environnements: [],
      variables: [],
      integrations: [],
    });
    expect(EnvironmentsFileSchema.safeParse(file({})).success).toBe(true);
  });

  it("une variable ne porte que son nom et son usage : la clé valeur est refusée", () => {
    const variables = [{ nom: "AUTH_SECRET", usage: "Sessions", valeur: "x" }];
    expect(refused(EnvironmentsFileSchema, file({ variables }))).toBe(true);
    const named = [{ nom: "AUTH_SECRET", usage: "Sessions" }];
    expect(EnvironmentsFileSchema.safeParse(file({ variables: named })).success).toBe(true);
  });

  it("nom de variable en majuscules, identifiants et noms uniques, vocabulaires fermés", () => {
    const variable = { nom: "A_B", usage: "x" };
    for (const patch of [
      { variables: [{ nom: "auth_secret", usage: "x" }] },
      { variables: [variable, variable] },
      { environnements: [ENVIRONMENT, ENVIRONMENT] },
      { environnements: [{ ...ENVIRONMENT, id: "ENV-1_a" }] },
      { environnements: [{ ...ENVIRONMENT, donnees: "prod" }] },
      { environnements: [{ ...ENVIRONMENT, deploiement: "jamais" }] },
      { integrations: [{ service: "S", usage: "u", statut: "ok" }] },
    ]) {
      expect(refused(EnvironmentsFileSchema, file(patch)), JSON.stringify(patch)).toBe(true);
    }
  });
});
