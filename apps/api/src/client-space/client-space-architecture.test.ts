import { describe, expect, it } from "vitest";
import { clientAdrOf, clientArchFlowOf, clientComponentOf } from "./client-space-architecture.ts";

/**
 * TK-113 lot A (cas 7 et 11 ; B575 à B592) : l'architecture vue du client. Un composant devient nom, type, zone, phrases
 * `resume_client`, fonctionnalités servies par libellé et dépendances par nom ; une décision son « En clair » et ses sections ;
 * un flux sa séquence. Responsabilité technique, tables possédées, décisions, chemin et SHA ne sortent jamais.
 */
const DATA = {
  id: "C-api",
  titre: "API",
  nom: "API",
  type: "service",
  zone: "Noyau métier",
  responsabilite: "Expose les procédures typées ; valide les droits côté serveur.",
  possede: ["T-user"],
  sert: ["F-001", "F-404", "T-user"],
  depend_de: [
    { vers: "C-db", via: "SQL" },
    { vers: "C-file", via: "File de tâches", mode: "asynchrone" },
    { vers: "C-fantome", via: "HTTP" },
    { vers: "autre", via: "HTTP" },
  ],
  decisions: ["ADR-001"],
  resume_client: ["Elle garde vos rendez-vous.", "Elle prévient le salon."],
};
const labels = new Map([["F-001", "Réserver un créneau"]]);
const names = new Map([
  ["C-db", "Base de données"],
  ["C-file", "File de tâches"],
]);

describe("composant vu du client", () => {
  it("nom, type, zone, phrases, fonctionnalités servies par libellé, dépendances par nom et moyen", () => {
    expect(clientComponentOf("C-api", DATA, { labels, names })).toEqual({
      id: "C-api",
      name: "API",
      type: "service",
      zone: "Noyau métier",
      summary: ["Elle garde vos rendez-vous.", "Elle prévient le salon."],
      serves: [{ id: "F-001", label: "Réserver un créneau" }],
      dependsOn: [
        { id: "C-db", name: "Base de données", via: "SQL" },
        { id: "C-file", name: "File de tâches", via: "File de tâches", async: true },
      ],
    });
  });

  it("jamais de responsabilité technique, de tables possédées ni de décisions (test de fuite sur les clés)", () => {
    const json = JSON.stringify(clientComponentOf("C-api", DATA, { labels, names }));
    expect(json).not.toMatch(
      /responsabilite|Expose les proc|possede|T-user|decisions|ADR-001|filePath/,
    );
  });

  it("données illisibles : nom repli sur l'identifiant, aucune phrase, rien de servi", () => {
    expect(clientComponentOf("C-x", null, { labels, names })).toEqual({
      id: "C-x",
      name: "C-x",
      type: "app",
      summary: [],
      serves: [],
      dependsOn: [],
    });
  });
});

const ADR = {
  specId: "ADR-004",
  title: "Connexion par lien magique",
  status: "acceptee" as const,
  date: "2026-10-29",
  deciders: ["Moussa"],
  context: "Contexte",
  decision: "Décision",
  consequences: { positive: ["Simple"], toAccept: ["Dépend des e-mails"] },
  alternatives: [{ name: "Mot de passe", reason: "Partage" }],
  links: ["C-auth", "T-user"],
  supersededBy: "ADR-009",
  supersededOn: "2026-11-02",
  plain: "On se connecte avec un lien.",
  filePath: "architecture/adr/ADR-004-x.md",
  commitSha: "a".repeat(40),
};

describe("décision vue du client", () => {
  it("garde les sections, « En clair » et la remplaçante ; retire liens, chemin et SHA", () => {
    const client = clientAdrOf(ADR);
    expect(client).toEqual({
      id: "ADR-004",
      title: "Connexion par lien magique",
      status: "acceptee",
      date: "2026-10-29",
      deciders: ["Moussa"],
      context: "Contexte",
      decision: "Décision",
      consequences: { positive: ["Simple"], toAccept: ["Dépend des e-mails"] },
      alternatives: [{ name: "Mot de passe", reason: "Partage" }],
      supersededBy: "ADR-009",
      supersededOn: "2026-11-02",
      plain: "On se connecte avec un lien.",
    });
    expect(JSON.stringify(client)).not.toMatch(/filePath|commitSha|links|T-user|architecture\/adr/);
  });
});

describe("flux vu du client", () => {
  it("séquence conservée ; chemin, SHA et décisions retirés", () => {
    const flow = {
      specId: "P-signup",
      title: "Inscription",
      actor: "Client",
      participants: [{ id: "C-api", name: "API", type: "service" as const }],
      items: [{ kind: "separator" as const, label: "Plus tard" }],
      features: ["F-001"],
      rules: [],
      decisions: ["ADR-001"],
      filePath: "architecture/flows/P-signup.yaml",
      commitSha: "a".repeat(40),
    };
    const client = clientArchFlowOf(flow);
    expect(client).toEqual({
      specId: "P-signup",
      title: "Inscription",
      actor: "Client",
      participants: flow.participants,
      items: flow.items,
      features: ["F-001"],
      rules: [],
    });
    expect(JSON.stringify(client)).not.toMatch(/filePath|commitSha|decisions|architecture\/flows/);
  });
});
