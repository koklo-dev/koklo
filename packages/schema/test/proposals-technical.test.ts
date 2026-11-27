import { describe, expect, it } from "vitest";
import {
  docSectionProposalSchema,
  ENVIRONMENT_DATA,
  ENVIRONMENT_DEPLOYMENTS,
  environmentProposalSchema,
  INTEGRATION_STATUSES,
  jsonSchemaOf,
  NFR_CATEGORIES,
  NFR_VERIFICATION_MODES,
  nfrProposalSchema,
  OPERATION_TYPES,
  operationProposalSchema,
  PROPOSAL_SCHEMAS,
  STACK_LAYERS,
  STACK_STATUSES,
  stackProposalSchema,
  TECHNICAL_PROPOSAL_VOCABULARY,
} from "../src/index.ts";

/** TK-115 lot A (fiche §7) : charges anglaises des propositions `stack`, `op`, `nfr`, `env` et section du cahier. */
const STACK = {
  role: "Fournisseur SMS",
  components: ["C-sms"],
  status: "open",
  options: ["Brevo", "Twilio", "OVHcloud SMS"],
  criteria: [{ label: "Prix estimé", estimate: true, values: ["≈ 0,045 €", "≈ 0,07 €", "—"] }],
  why: "SMS et e-mail chez le même prestataire.",
  requirements: ["NFR-001"],
  decisions: ["ADR-006"],
};
const OPERATION = {
  name: "waitlist.join",
  type: "write",
  zone: "Prise de rendez-vous",
  component: "C-api",
  summary: "Inscrit un client sur la liste d'attente.",
  permission: "public",
  input: [{ field: "serviceId", type: "uuid", constraint: "service actif" }],
  output: [{ field: "position", type: "entier" }],
  errors: [{ code: "DEJA_INSCRIT", when: "même téléphone", rule: "R-002" }],
  rules: ["R-002"],
  features: ["F-249"],
  rateLimit: "5 par heure",
};
const NFR = {
  category: "performance",
  title: "Temps de réponse",
  target: "p95 < 300 ms",
  statement: "Les réservations répondent vite.",
  verification: "ci_measure",
  verificationDetail: "Mesure à chaque fusion",
  links: ["C-api", "ST-api", "ADR-001", "R-003"],
};
const ENVIRONMENT = {
  name: "Recette",
  address: "recette.atelier-lumiere.fr",
  hosting: "Scaleway · Paris",
  database: "PostgreSQL géré",
  data: "anonymized",
  deployment: "merge",
  access: "Équipe + client",
  extras: [{ label: "SMS", value: "Numéros de test" }],
  variables: [{ name: "DATABASE_URL", usage: "Connexion à la base" }],
  integrations: [{ service: "Sentry", usage: "Erreurs", status: "configured" }],
};

type Schema = { safeParse(value: unknown): { success: boolean } };
const accepts = (schema: Schema, value: unknown) => schema.safeParse(value).success;
const refusesAll = (schema: Schema, base: object, patches: readonly object[]) => {
  for (const patch of patches) {
    expect(accepts(schema, { ...base, ...patch }), JSON.stringify(patch)).toBe(false);
  }
};

describe("stack", () => {
  it("valide, specId ST- facultatif", () => {
    expect(accepts(stackProposalSchema, STACK)).toBe(true);
    expect(accepts(stackProposalSchema, { ...STACK, specId: "ST-sms", layer: "external" })).toBe(
      true,
    );
  });

  it("choix requis si chosen, absent si open ; 2 à 4 options ; valeurs alignées", () => {
    expect(accepts(stackProposalSchema, { ...STACK, status: "chosen", choice: "Brevo" })).toBe(
      true,
    );
    refusesAll(stackProposalSchema, STACK, [
      { status: "chosen" },
      { choice: "Brevo" },
      { options: ["Brevo"] },
      { options: ["a", "b", "c", "d", "e"], criteria: [] },
      { options: ["Brevo", "Brevo"], criteria: [] },
      { criteria: [{ label: "Prix", values: ["1"] }] },
      { recommended: "Autre" },
      { specId: "sms" },
      { icon: "bolt" },
      { value: "x" },
      { why: "voir https://example.test" },
    ]);
  });
});

describe("opération, exigence, environnement", () => {
  it("valides", () => {
    expect(accepts(operationProposalSchema, OPERATION)).toBe(true);
    expect(accepts(nfrProposalSchema, NFR)).toBe(true);
    expect(accepts(environmentProposalSchema, ENVIRONMENT)).toBe(true);
    expect(accepts(operationProposalSchema, { ...OPERATION, specId: "waitlist.join" })).toBe(true);
    expect(accepts(nfrProposalSchema, { ...NFR, specId: "NFR-001" })).toBe(true);
    expect(accepts(environmentProposalSchema, { ...ENVIRONMENT, specId: "ENV-recette" })).toBe(
      true,
    );
  });

  it("opération : nom zone.verbe, vocabulaires et références fermés", () => {
    refusesAll(operationProposalSchema, OPERATION, [
      { name: "E-waitlist" },
      { type: "lecture" },
      { permission: "admin" },
      { component: "api" },
      { input: [{ type: "uuid" }] },
      { errors: [{ code: "X" }] },
      { rules: ["F-001"] },
    ]);
  });

  it("exigence : catégorie, vérification et liens fermés", () => {
    refusesAll(nfrProposalSchema, NFR, [
      { category: "securite" },
      { verification: "audit" },
      { links: ["F-001"] },
      { specId: "ST-api" },
    ]);
  });

  it("environnement : une variable ne porte jamais de valeur", () => {
    refusesAll(environmentProposalSchema, ENVIRONMENT, [
      { variables: [{ name: "A_B", usage: "u", value: "x" }] },
      { variables: [{ name: "a_b", usage: "u" }] },
      { data: "reelles" },
      { deployment: "never" },
      { specId: "recette" },
    ]);
  });
});

describe("section du cahier, registre et vocabulaire", () => {
  it("doc_section : specId DOC- facultatif (section existante vide)", () => {
    const section = { title: "Exploitation", markdown: "Texte." };
    expect(accepts(docSectionProposalSchema, { ...section, specId: "DOC-exploitation" })).toBe(
      true,
    );
    expect(accepts(docSectionProposalSchema, { ...section, specId: "exploitation" })).toBe(false);
  });

  it("les quatre types sont au registre, au schéma fournisseur fermé", () => {
    expect(PROPOSAL_SCHEMAS.stack).toBe(stackProposalSchema);
    expect(PROPOSAL_SCHEMAS.op).toBe(operationProposalSchema);
    expect(PROPOSAL_SCHEMAS.nfr).toBe(nfrProposalSchema);
    expect(PROPOSAL_SCHEMAS.env).toBe(environmentProposalSchema);
    for (const kind of ["stack", "op", "nfr", "env"] as const) {
      expect(jsonSchemaOf(PROPOSAL_SCHEMAS[kind])).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
    }
  });

  it("le vocabulaire anglais couvre exactement les valeurs des fichiers", () => {
    const pairs = [
      [TECHNICAL_PROPOSAL_VOCABULARY.layer, STACK_LAYERS],
      [TECHNICAL_PROPOSAL_VOCABULARY.stackStatus, STACK_STATUSES],
      [TECHNICAL_PROPOSAL_VOCABULARY.operationType, OPERATION_TYPES],
      [TECHNICAL_PROPOSAL_VOCABULARY.category, NFR_CATEGORIES],
      [TECHNICAL_PROPOSAL_VOCABULARY.verification, NFR_VERIFICATION_MODES],
      [TECHNICAL_PROPOSAL_VOCABULARY.environmentData, ENVIRONMENT_DATA],
      [TECHNICAL_PROPOSAL_VOCABULARY.deployment, ENVIRONMENT_DEPLOYMENTS],
      [TECHNICAL_PROPOSAL_VOCABULARY.integrationStatus, INTEGRATION_STATUSES],
    ] as const;
    for (const [map, values] of pairs) {
      expect([...Object.values(map)].sort()).toEqual([...values].sort());
    }
  });
});
