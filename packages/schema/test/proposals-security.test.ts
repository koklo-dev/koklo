import { describe, expect, it } from "vitest";
import {
  ASVS_CHAPTERS,
  asvsProposalSchema,
  DATA_CATEGORIES,
  findSecretPaths,
  jsonSchemaOf,
  PROPOSAL_SCHEMAS,
  rightProposalSchema,
  SECURITY_PROPOSAL_VOCABULARY,
  securityProposalTitle,
  sensitiveProposalSchema,
  summaryProposalSchema,
  THREAT_CATEGORIES,
  THREAT_SEVERITIES,
  THREAT_VERIFICATION_MODES,
  threatProposalSchema,
} from "../src/index.ts";

/** TK-117 lot A (cas 4, A7, B794, B796) : charges anglaises `threat`, `sensitive`, `right`, `asvs`, `summary`. */
const THREAT = {
  title: "Lien intercepté",
  surfaces: ["F-009", "api"],
  category: "spoofing",
  severity: "high",
  risk: "Quelqu'un récupère un lien.",
  measures: ["Lien à usage unique."],
  verification: "scenario",
  scenario: { when: "le lien est rejoué", expected: "la connexion est refusée" },
  links: ["auth.magicLink", "liens.jeton_hash"],
};
const SENSITIVE = {
  data: "Téléphone",
  fields: ["clients.telephone"],
  category: "contact",
  access: ["Gérante"],
  protection: "Chiffré au repos.",
  retentionSuggestion: "3 ans",
};
const RIGHT = { role: "RL-gerante", permission: "PM-client.exporter", restriction: "2e facteur" };
const REQUIREMENT = {
  requirement: { chapter: "logging", title: "Journal d'audit", level: 2, links: [] },
};
const SUMMARY = {
  location: "En France.",
  protection: "Les téléphones sont chiffrés.",
  access: "Seule la gérante exporte.",
  signIn: "Par un lien à usage unique.",
  checks: "Des essais d'actions interdites.",
  incident: "Nous vous prévenons.",
};

type Schema = { safeParse(value: unknown): { success: boolean } };
const accepts = (schema: Schema, value: unknown) => schema.safeParse(value).success;
const refusesAll = (schema: Schema, base: object, patches: readonly object[]) => {
  for (const patch of patches) {
    expect(accepts(schema, { ...base, ...patch }), JSON.stringify(patch)).toBe(false);
  }
};

describe("menace et donnée", () => {
  it("menace valide, specId SEC-T facultatif posé par le code", () => {
    expect(accepts(threatProposalSchema, THREAT)).toBe(true);
    expect(accepts(threatProposalSchema, { ...THREAT, specId: "SEC-T08" })).toBe(true);
    refusesAll(threatProposalSchema, THREAT, [
      { specId: "T-user" },
      { surfaces: [] },
      { surfaces: ["../x"] },
      { title: "a\nb" },
      { risk: "voir https://x.fr" },
      { measures: ["<b>x</b>"] },
      { extra: 1 },
    ]);
  });

  it("donnée : jamais de conservation écrite, seulement une suggestion (A7)", () => {
    expect(accepts(sensitiveProposalSchema, SENSITIVE)).toBe(true);
    expect(accepts(sensitiveProposalSchema, { ...SENSITIVE, specId: "clients.telephone" })).toBe(
      true,
    );
    refusesAll(sensitiveProposalSchema, SENSITIVE, [
      { conservation: "3 ans" },
      { retention: "3 ans" },
      { conservation_proposee: "3 ans" },
      { fields: [] },
      { fields: ["clients"] },
      { category: "sante" },
    ]);
  });
});

describe("droit, ASVS, résumé", () => {
  it("un droit ne fait que restreindre, ou énonce une règle de propriété (B794)", () => {
    expect(accepts(rightProposalSchema, RIGHT)).toBe(true);
    expect(accepts(rightProposalSchema, { ownershipRule: "Chacun ses données." })).toBe(true);
    for (const value of [
      {},
      { role: "RL-gerante", permission: "PM-client.exporter" },
      { ...RIGHT, ownershipRule: "x" },
      { ...RIGHT, access: "yes" },
      { ...RIGHT, grant: true },
    ]) {
      expect(accepts(rightProposalSchema, value), JSON.stringify(value)).toBe(false);
    }
  });

  it("ASVS : une exigence ou des faits, jamais le niveau du projet", () => {
    expect(accepts(asvsProposalSchema, REQUIREMENT)).toBe(true);
    expect(accepts(asvsProposalSchema, { facts: [{ label: "Rotation", value: "90 j" }] })).toBe(
      true,
    );
    for (const value of [
      {},
      { ...REQUIREMENT, facts: [{ label: "a", value: "b" }] },
      { ...REQUIREMENT, projectLevel: 3 },
      { level: 3 },
      { requirement: { ...REQUIREMENT.requirement, level: 4 } },
    ]) {
      expect(accepts(asvsProposalSchema, value), JSON.stringify(value)).toBe(false);
    }
  });

  it("résumé : six cartes, ni conservation, ni identifiant", () => {
    expect(accepts(summaryProposalSchema, SUMMARY)).toBe(true);
    refusesAll(summaryProposalSchema, SUMMARY, [
      { retention: "3 ans" },
      { access: "Voir RL-gerante" },
      { location: "voir security/data.yaml" },
      { incident: undefined },
    ]);
  });
});

describe("vocabulaires et schémas demandés au fournisseur", () => {
  it("chaque mot anglais a sa valeur de fichier", () => {
    const values = (key: keyof typeof SECURITY_PROPOSAL_VOCABULARY) =>
      Object.values(SECURITY_PROPOSAL_VOCABULARY[key]);
    expect(values("category")).toEqual([...THREAT_CATEGORIES]);
    expect(values("severity")).toEqual([...THREAT_SEVERITIES]);
    expect(values("verification")).toEqual([...THREAT_VERIFICATION_MODES]);
    expect(values("dataCategory")).toEqual([...DATA_CATEGORIES]);
    expect(values("chapter")).toEqual([...ASVS_CHAPTERS]);
    expect(Object.keys(SECURITY_PROPOSAL_VOCABULARY.section)).toEqual(Object.keys(SUMMARY));
  });

  it("aucun schéma de la Sécurité ne propose de champ de conservation (A7)", () => {
    for (const kind of ["threat", "sensitive", "right", "asvs", "summary"] as const) {
      const schema = JSON.stringify(jsonSchemaOf(PROPOSAL_SCHEMAS[kind]));
      expect(schema, kind).toContain("additionalProperties");
      expect(schema, kind).not.toMatch(/"(conservation|retention)":/);
    }
  });

  it("une valeur de secret est repérée dans chaque charge (valeur fabriquée à l'exécution)", () => {
    const secret = ["ghp", "a".repeat(30)].join("_");
    for (const value of [
      { ...THREAT, risk: secret },
      { ...SENSITIVE, protection: secret },
      { ...RIGHT, restriction: secret },
      { facts: [{ label: "Clé", value: secret }] },
      { ...SUMMARY, location: secret },
    ]) {
      expect(findSecretPaths(value)).toHaveLength(1);
    }
  });
});

describe("TK-117 titres des propositions de la Sécurité", () => {
  it("restriction ou règle, exigence ou faits, résumé ; les autres types gardent leur champ", () => {
    expect(securityProposalTitle("right", { restriction: "du jour" })).toBe("du jour");
    expect(securityProposalTitle("right", { ownershipRule: "Règle." })).toBe("Règle.");
    expect(securityProposalTitle("asvs", { requirement: { title: "Sessions" } })).toBe("Sessions");
    expect(securityProposalTitle("asvs", { facts: [] })).toBe("Secrets et dépendances");
    expect(securityProposalTitle("summary", {})).toBe("Résumé client");
    expect(securityProposalTitle("threat", { title: "x" })).toBeUndefined();
  });
});
