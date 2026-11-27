import { describe, expect, it } from "vitest";
import { type TriageContext, titleKey, triageProposals } from "./triage.ts";
import type { SecurityRefs } from "./triage-security.ts";

/**
 * TK-117 lot B (cas 4, 6, B806, modèle de menace 5 à 7) : tri des propositions de la Sécurité. Références inconnues,
 * champ inconnu, conservation, identifiant dans le résumé, octroi de droit et secret écartés ; `specId` posé par le code.
 */
const refs = (): SecurityRefs => ({
  surfaces: new Set(["F-001", "F-002", "api"]),
  fields: new Set(["clientes.telephone", "clientes.note", "clientes.id"]),
  unclassified: new Set(["clientes.telephone", "clientes.note"]),
  roles: new Map([["RL-accueil", new Set(["PM-client.lire"])]]),
  restrictions: new Set([`RL-accueil PM-client.lire ${titleKey("du jour")}`]),
  ownershipRules: new Set([titleKey("Chacun voit les siens.")]),
  threats: new Map([
    [titleKey("Export massif"), { specId: "SEC-T08", open: true }],
    [titleKey("Lien rejoué"), { specId: "SEC-T01", open: false }],
  ]),
  requirements: new Map([
    [titleKey("Expiration"), { id: "EX-001", answered: false }],
    [titleKey("Contrat"), { id: "EX-002", answered: true }],
  ]),
  level: 2,
  docSections: new Map([
    ["DOC-objet", false],
    ["DOC-incident", true],
  ]),
});
const context = (): TriageContext => ({
  kinds: ["threat", "sensitive", "right", "asvs", "summary", "doc_section"],
  titles: {},
  missingCriteria: new Map(),
  sec: refs(),
});
const entry = (kind: string, content: object) => ({ kind, rationale: "Manquant", content });
const threat = (title: string, over: object = {}) =>
  entry("threat", {
    title,
    surfaces: ["F-001"],
    category: "abuse",
    severity: "high",
    risk: "Abus.",
    measures: ["Limiter."],
    verification: "scenario",
    links: [],
    ...over,
  });
const sensitive = (fields: string[], over: object = {}) =>
  entry("sensitive", { data: fields.join(), fields, category: "contact", access: [], ...over });
const SUMMARY = {
  location: "Chez l'hébergeur.",
  protection: "Chiffré.",
  access: "Chacun les siens.",
  signIn: "Lien.",
  checks: "Tests.",
  incident: "24 heures.",
};
const triage = (entries: unknown[], ctx = context()) =>
  triageProposals({ proposals: entries }, ctx);
const secret = () => ["sk", "live", "z".repeat(32)].join("_");

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même fonction, un test par comportement
describe("tri de la Sécurité", () => {
  it("menaces : nouvelle sans specId, ouverte reprise avec sa cible, traitée écartée", () => {
    const result = triage([
      threat("Nouvelle menace"),
      threat("Export massif"),
      threat("Lien rejoué"),
      threat("Surface inconnue", { surfaces: ["F-009"] }),
      threat("Champ inconnu", { links: ["clientes.photo"] }),
      threat("Rôle inconnu", { links: ["RL-inconnu"] }),
      threat("Parade absente sur ouverte", { title: "Export massif", measures: [] }),
      threat("specId du modèle", { specId: "SEC-T99" }),
    ]);
    expect(result.accepted.map((c) => [c.title, c.payload.specId])).toEqual([
      ["Nouvelle menace", undefined],
      ["Export massif", "SEC-T08"],
    ]);
    expect(result.discarded).toBe(6);
  });

  it("données : champs non classés seuls, jamais de conservation, une fois chacun", () => {
    const result = triage([
      sensitive(["clientes.telephone"], { retentionSuggestion: "3 ans" }),
      sensitive(["clientes.telephone"]),
      sensitive(["clientes.id"]),
      sensitive(["clientes.photo"]),
      sensitive(["clientes.note"], { retention: "1 an" }),
      sensitive(["clientes.note"], { conservation: "1 an" }),
      sensitive(["clientes.note"]),
    ]);
    expect(result.accepted.map((c) => c.payload.fields)).toEqual([
      ["clientes.telephone"],
      ["clientes.note"],
    ]);
    expect(result.accepted[0]?.zone).toBe("clientes");
    expect(result.discarded).toBe(5);
  });

  it("droits : restreindre une permission portée seulement ; pas de doublon", () => {
    const right = (content: object) => entry("right", content);
    const restriction = (role: string, permission: string, text: string) =>
      right({ role, permission, restriction: text });
    const result = triage([
      restriction("RL-accueil", "PM-client.lire", "ses clientes"),
      restriction("RL-accueil", "PM-client.exporter", "x"),
      restriction("RL-autre", "PM-client.lire", "x"),
      restriction("RL-accueil", "PM-client.lire", "du jour"),
      right({ ownershipRule: "Chacun voit les siens." }),
      right({ ownershipRule: "Aucun agent n'accède à la production." }),
    ]);
    expect(result.accepted.map((c) => c.title)).toEqual([
      "ses clientes",
      "Aucun agent n'accède à la production.",
    ]);
  });

  it("exigences : sans réponse reprise par le code, niveau dépassé et identifiant du modèle écartés", () => {
    const requirement = (title: string, over: object = {}) =>
      entry("asvs", {
        requirement: { chapter: "sessions", title, level: 2, answer: "Oui.", links: [], ...over },
      });
    const result = triage([
      requirement("Expiration"),
      requirement("Contrat"),
      requirement("Trop haut", { level: 3 }),
      requirement("Choisie par le modèle", { specId: "EX-009" }),
      requirement("Nouvelle exigence"),
      entry("asvs", { facts: [{ label: "Secrets", value: "Coffre" }] }),
    ]);
    expect(
      result.accepted.map((c) => (c.payload.requirement as { specId?: string })?.specId),
    ).toEqual(["EX-001", undefined, undefined]);
    expect(result.accepted.map((c) => c.title)).toEqual([
      "Expiration",
      "Nouvelle exigence",
      "Secrets et dépendances",
    ]);
  });

  it("résumé : un seul, jamais un identifiant ; secret toujours écarté", () => {
    const result = triage([
      entry("summary", { ...SUMMARY, access: "Voir SEC-T01." }),
      entry("summary", { ...SUMMARY, checks: secret() }),
      entry("summary", SUMMARY),
      entry("summary", SUMMARY),
    ]);
    expect(result.accepted.map((c) => c.title)).toEqual(["Résumé client"]);
    expect(result.discarded).toBe(3);
  });

  it("dossier : sections absentes ou vides seulement", () => {
    const section = (title: string) => entry("doc_section", { title, markdown: "Texte." });
    const result = triage([section("Objet"), section("Incident"), section("Sauvegardes")]);
    expect(result.accepted.map((c) => c.payload.specId)).toEqual(["DOC-incident", undefined]);
    expect(result.existingSections).toBe(1);
  });
});
