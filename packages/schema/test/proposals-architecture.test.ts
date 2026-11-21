import { describe, expect, it } from "vitest";
import {
  adrProposalSchema,
  archflowProposalSchema,
  componentProposalSchema,
  docSectionProposalSchema,
  jsonSchemaOf,
  PROPOSAL_SCHEMAS,
} from "../src/index.ts";

/** TK-111 lot A : charges des propositions `component`, `archflow`, `adr`, `doc_section` (sortie du modèle = donnée hostile). */
const COMPONENT = {
  name: "API métier",
  type: "service",
  zone: "Noyau",
  responsibility: "Expose les procédures métier.",
  owns: ["T-user"],
  serves: ["F-001"],
  dependsOn: [
    { to: "C-db", via: "SQL" },
    { to: "C-file", via: "AMQP", async: true },
  ],
  decisions: ["ADR-001"],
  clientSummary: ["Le coeur du produit"],
};
const FLOW = {
  flow: "P-inscription",
  participants: ["RL-visiteur", "C-api"],
  messages: [
    { from: "RL-visiteur", to: "C-api", text: "Envoie le formulaire", reply: "Compte créé" },
    {
      block: "alt",
      label: "Adresse prise",
      messages: [{ from: "C-api", to: "RL-visiteur", text: "Refuse", error: "Doublon" }],
    },
    { block: "separator", label: "Plus tard" },
  ],
  features: ["F-001"],
  rules: ["R-003"],
  decisions: ["ADR-001"],
};
const ADR = {
  title: "Base relationnelle",
  context: "Les données sont liées.",
  decision: "Une base relationnelle.",
  positives: ["Transactions simples"],
  accepted: ["Montée en charge verticale"],
  alternatives: [{ name: "Documentaire", reason: "Trop de liens" }],
  plain: "Une seule base pour rester cohérent.",
  links: ["F-001", "T-user"],
};
const SECTION = { title: "Vue d'ensemble", markdown: "# Vue d'ensemble\n\nLe produit en bref." };

describe("vocabulaire", () => {
  it("quatre schémas de plus, dans l'ordre du vocabulaire", () => {
    expect(Object.keys(PROPOSAL_SCHEMAS).slice(-4)).toEqual([
      "component",
      "archflow",
      "adr",
      "doc_section",
    ]);
  });
});

describe("componentProposalSchema", () => {
  it("accepte un composant complet ; l'identifiant C- n'est jamais fourni", () => {
    expect(componentProposalSchema.safeParse(COMPONENT).success).toBe(true);
    expect(componentProposalSchema.safeParse({ ...COMPONENT, id: "C-api" }).success).toBe(false);
  });

  it("refuse type hors liste, lien mal formé, champ inconnu, texte hostile", () => {
    const bad = (extra: object) =>
      componentProposalSchema.safeParse({ ...COMPONENT, ...extra }).success;
    expect(bad({ type: "lambda" })).toBe(false);
    expect(bad({ owns: ["user"] })).toBe(false);
    expect(bad({ dependsOn: [{ to: "api", via: "SQL" }] })).toBe(false);
    expect(bad({ dependsOn: [{ to: "C-db" }] })).toBe(false);
    expect(bad({ extra: 1 })).toBe(false);
    expect(bad({ name: "voir https://x.fr" })).toBe(false);
    expect(bad({ responsibility: "<b>gras</b>" })).toBe(false);
    expect(bad({ name: "a\nb" })).toBe(false);
    expect(bad({ clientSummary: Array.from({ length: 13 }, (_, i) => `Phrase ${i}`) })).toBe(false);
  });
});

describe("archflowProposalSchema", () => {
  it("accepte messages, alt et séparateurs", () => {
    expect(archflowProposalSchema.safeParse(FLOW).success).toBe(true);
  });

  it("refuse un identifiant de parcours mal formé, un participant inconnu du vocabulaire, aucun message, trop de messages", () => {
    const bad = (extra: object) => archflowProposalSchema.safeParse({ ...FLOW, ...extra }).success;
    expect(bad({ flow: "inscription" })).toBe(false);
    expect(bad({ participants: ["T-user", "C-api"] })).toBe(false);
    expect(bad({ participants: ["C-api"] })).toBe(false);
    expect(bad({ messages: [] })).toBe(false);
    expect(bad({ messages: Array.from({ length: 61 }, () => FLOW.messages[0]) })).toBe(false);
    expect(bad({ messages: [{ from: "C-api", to: "C-api", text: "x\ny" }] })).toBe(false);
    expect(bad({ messages: [{ block: "boucle", label: "x", messages: [] }] })).toBe(false);
  });
});

describe("adrProposalSchema", () => {
  it("accepte une décision complète", () => {
    expect(adrProposalSchema.safeParse(ADR).success).toBe(true);
    expect(adrProposalSchema.safeParse({ ...ADR, plain: undefined }).success).toBe(true);
  });

  it("refuse alternative incomplète, lien hors vocabulaire, titre hostile, champ inconnu, aucune alternative", () => {
    const bad = (extra: object) => adrProposalSchema.safeParse({ ...ADR, ...extra }).success;
    expect(bad({ alternatives: [{ name: "x" }] })).toBe(false);
    expect(bad({ alternatives: [] })).toBe(false);
    expect(bad({ links: ["X-1"] })).toBe(false);
    expect(bad({ title: "![x](y)" })).toBe(false);
    expect(bad({ id: "ADR-001" })).toBe(false);
    expect(bad({ decision: "" })).toBe(false);
  });
});

describe("docSectionProposalSchema", () => {
  it("accepte un titre et un texte multiligne ; refuse lien, balise, vide, champ inconnu", () => {
    expect(docSectionProposalSchema.safeParse(SECTION).success).toBe(true);
    const bad = (extra: object) =>
      docSectionProposalSchema.safeParse({ ...SECTION, ...extra }).success;
    expect(bad({ markdown: "voir https://x.fr" })).toBe(false);
    expect(bad({ markdown: "<script>x</script>" })).toBe(false);
    expect(bad({ markdown: "" })).toBe(false);
    expect(bad({ title: "a\nb" })).toBe(false);
    expect(bad({ path: "../x" })).toBe(false);
  });
});

describe("schéma JSON demandé au fournisseur", () => {
  it.each(["component", "archflow", "adr", "doc_section"] as const)("%s : objet fermé", (kind) => {
    const schema = jsonSchemaOf(PROPOSAL_SCHEMAS[kind]) as {
      type?: string;
      additionalProperties?: unknown;
    };
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
  });
});
