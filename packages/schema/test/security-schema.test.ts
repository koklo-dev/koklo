import { describe, expect, it } from "vitest";
import {
  AsvsFileSchema,
  findSecretPaths,
  PATTERNS,
  RightsFileSchema,
  SECURITY_DOSSIER_SECTIONS,
  SecurityDataSchema,
  SecuritySummarySchema,
  SUMMARY_SECTIONS,
  ThreatSchema,
} from "../src/index.ts";

/** TK-117 lot A (cas 1) : formats fermés des fichiers `security/`, textes d'une ligne, bornes. */
const THREAT = {
  id: "SEC-T01",
  titre: "Lien intercepté",
  surfaces: ["F-001"],
  categorie: "usurpation",
  gravite: "elevee",
  risque: "Deux\nlignes permises.",
  verification: { mode: "revue_humaine" },
};
const ENTRY = { donnee: "E-mail", champs: ["user.email"], categorie: "contact" };
const SUMMARY = Object.fromEntries(SUMMARY_SECTIONS.map(({ key }) => [key, "Une phrase simple."]));

type Schema = { safeParse(value: unknown): { success: boolean } };
const accepts = (schema: Schema, value: unknown) => schema.safeParse(value).success;
const refusesAll = (schema: Schema, base: object, patches: readonly object[]) => {
  for (const patch of patches) {
    expect(accepts(schema, { ...base, ...patch }), JSON.stringify(patch)).toBe(false);
  }
};

describe("menace", () => {
  it("valide au minimum : parades et liens vides par défaut, surface « api » admise", () => {
    const parsed = ThreatSchema.parse({ ...THREAT, surfaces: ["api"] });
    expect(parsed.parades).toEqual([]);
    expect(parsed.liens).toEqual([]);
  });

  it("identifiant, vocabulaires, surfaces et objet fermés", () => {
    refusesAll(ThreatSchema, THREAT, [
      { id: "SEC-T1" },
      { id: "SEC-01" },
      { surfaces: [] },
      { surfaces: ["API"] },
      { surfaces: ["../x"] },
      { categorie: "autre" },
      { gravite: "critique" },
      { verification: { mode: "manuel" } },
      { inconnu: 1 },
      { liens: ["../../etc/passwd"] },
      { scenario: { quand: "x" } },
    ]);
  });

  it("une ligne par champ sauf `risque` ; textes bornés", () => {
    refusesAll(ThreatSchema, THREAT, [
      { titre: "a\nb" },
      { parades: ["a\nb"] },
      { scenario: { quand: "a\n    Alors rien", alors: "b" } },
      { verification: { mode: "scenario", detail: "a\rb" } },
      { titre: "x".repeat(201) },
      { risque: "x".repeat(2001) },
      { risque: "a\u0000b" },
      { titre: "a\u2028b" },
    ]);
  });

  it("liens : opération, table, champ, rôle, exigence, choix, environnement, écran, règle", () => {
    const liens = [
      "reservation.cancel",
      "T-user",
      "user.email",
      "RL-admin",
      "NFR-001",
      "ST-sms",
      "ENV-recette",
      "S-register",
      "R-003",
    ];
    expect(accepts(ThreatSchema, { ...THREAT, liens })).toBe(true);
    expect(PATTERNS.threat.test("SEC-T100")).toBe(true);
  });
});

describe("données sensibles", () => {
  it("fichier vide accepté ; `protection` sur plusieurs lignes", () => {
    expect(SecurityDataSchema.parse({}).donnees).toEqual([]);
    const donnees = [{ ...ENTRY, protection: "a\nb", conservation: "1 an" }];
    expect(accepts(SecurityDataSchema, { donnees })).toBe(true);
  });

  it("champs explicites `<table>.<champ>`, au moins un, une seule entrée par champ", () => {
    const base = { donnees: [ENTRY] };
    refusesAll(SecurityDataSchema, base, [
      { donnees: [{ ...ENTRY, champs: [] }] },
      { donnees: [{ ...ENTRY, champs: ["user"] }] },
      { donnees: [{ ...ENTRY, champs: ["T-user.email"] }] },
      { donnees: [{ ...ENTRY, champs: ["user.email", "user.email"] }] },
      { donnees: [ENTRY, { ...ENTRY, donnee: "Autre" }] },
      { donnees: [{ ...ENTRY, categorie: "sante" }] },
      { donnees: [{ ...ENTRY, conservation: "a\nb" }] },
      { donnees: [{ ...ENTRY, duree: "1 an" }] },
    ]);
  });
});

describe("droits et ASVS", () => {
  const CELL = { role: "RL-admin", acces: "restreint", restriction: "les siens" };
  const ROW = { action: "PM-compte.creer", libelle: "Créer", cases: [CELL] };

  it("matrice fermée : accès oui, non ou restreint", () => {
    expect(RightsFileSchema.parse({}).matrice).toEqual([]);
    expect(accepts(RightsFileSchema, { matrice: [ROW] })).toBe(true);
    refusesAll(RightsFileSchema, {}, [
      { matrice: [{ ...ROW, cases: [{ ...CELL, acces: "peut-etre" }] }] },
      { restrictions: [{ role: "RL-admin", restriction: "x" }] },
      { propriete: ["a\nb"] },
      { octrois: [] },
    ]);
  });

  it("ASVS : niveau facultatif 1 à 3, neuf chapitres, identifiants uniques", () => {
    const requirement = { id: "V2.1.1", chapitre: "validation", titre: "t", niveau: 1 };
    expect(accepts(AsvsFileSchema, { exigences: [requirement] })).toBe(true);
    expect(AsvsFileSchema.parse({}).niveau).toBeUndefined();
    refusesAll(AsvsFileSchema, {}, [
      { niveau: 4 },
      { niveau: 0 },
      { exigences: [{ ...requirement, chapitre: "autre" }] },
      { exigences: [requirement, requirement] },
      { exigences: [{ ...requirement, id: "../x" }] },
      { secrets_et_dependances: [{ libelle: "x" }] },
    ]);
  });
});

describe("résumé client et dossier", () => {
  it("sept sections fixes, toutes obligatoires", () => {
    expect(SUMMARY_SECTIONS.map((s) => s.title)).toEqual([
      "Où sont les données",
      "Ce qui est protégé",
      "Qui voit quoi",
      "Comment on se connecte",
      "Combien de temps on garde",
      "Ce qui est vérifié à chaque modification",
      "En cas d'incident",
    ]);
    expect(accepts(SecuritySummarySchema, SUMMARY)).toBe(true);
    refusesAll(SecuritySummarySchema, SUMMARY, [
      { donnees: "" },
      { donnees: undefined },
      { annexe: "x" },
      { acces: "Voir F-001" },
      { acces: "## Titre injecté" },
    ]);
  });

  it("dossier de sécurité : sept sections et une proposée", () => {
    expect(SECURITY_DOSSIER_SECTIONS.map((s) => [s.title, s.proposed ?? false])).toEqual([
      ["Objet et périmètre", false],
      ["Données personnelles et RGPD", false],
      ["Authentification et sessions", false],
      ["Contrôle d'accès", false],
      ["Menaces et parades", false],
      ["Secrets et dépendances", false],
      ["Réponse à un incident", false],
      ["Sauvegardes et restauration", true],
    ]);
  });
});

describe("secrets (B724) : refusés dans chaque contenu de la Sécurité", () => {
  it("le détecteur commun trouve la valeur dans une menace, une donnée, les droits, l'ASVS, le résumé", () => {
    // Valeur fabriquée à l'exécution : rien qui ressemble à un secret dans le dépôt.
    const secret = ["sk", "live", "a".repeat(24)].join("_");
    const contents = [
      { ...THREAT, parades: [secret] },
      { donnees: [{ ...ENTRY, protection: secret }] },
      { propriete: [secret] },
      { secrets_et_dependances: [{ libelle: "Clé", valeur: secret }] },
      { ...SUMMARY, donnees: secret },
    ];
    for (const content of contents) {
      const found = findSecretPaths(content);
      expect(found.length, JSON.stringify(Object.keys(content))).toBe(1);
      expect(found[0]).not.toContain(secret);
    }
  });
});
