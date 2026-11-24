import { describe, expect, it } from "vitest";
import { kindsOfMode } from "./generate.ts";
import { batchPrompt, zonesPrompt } from "./prompts.ts";
import type { LaunchSources } from "./sources.ts";

/** TK-103 (B342) : types demandés par mode, et titres existants (règles, rôles, parcours) fournis au modèle comme données non fiables. */
const sources: LaunchSources = {
  tag: "idea-v1",
  pages: [],
  synthesis: null,
  risks: null,
  features: [],
  rules: [{ specId: "R-001", title: "Annulation tardive" }],
  roles: [{ specId: "RL-admin", title: "Administrateur" }],
  flows: [{ specId: "P-inscription", title: "Inscription" }],
};
const NONCE = "ab".repeat(24);
const textOf = (kinds: Parameters<typeof batchPrompt>[1]["kinds"]) => {
  const prompt = batchPrompt(NONCE, { sources, instruction: null, zone: "Accès", kinds });
  return `${prompt.system}\n${prompt.user}`;
};

describe("kindsOfMode", () => {
  it("complete et update : fonctionnalité, règle, rôle, parcours ; criteria : critères ; all : les cinq", () => {
    expect(kindsOfMode("complete")).toEqual(["feature", "rule", "role", "flow"]);
    expect(kindsOfMode("update")).toEqual(["feature", "rule", "role", "flow"]);
    expect(kindsOfMode("criteria")).toEqual(["criteria"]);
    expect(kindsOfMode("all")).toEqual(["feature", "criteria", "rule", "role", "flow"]);
  });
});

describe("kindsOfMode pour les Données (TK-107)", () => {
  it("complete et all demandent table, relations, fixtures ; le livrable par défaut reste le Fonctionnel", () => {
    expect(kindsOfMode("complete", "data")).toEqual(["table", "relations", "fixtures"]);
    expect(kindsOfMode("all", "data")).toEqual(["table", "relations", "fixtures"]);
    expect(kindsOfMode("complete")).toEqual(["feature", "rule", "role", "flow"]);
  });
});

describe("prompts des Données (TK-107)", () => {
  const dataSources: LaunchSources = {
    ...sources,
    features: [{ specId: "F-001", title: "Réserver une salle", criteria: [] }],
    tables: [{ specId: "T-salle", title: "Salle", zone: "Réservations", fields: ["id", "nom"] }],
    fixtures: [{ specId: "FX-salles", title: "Salles de démonstration" }],
  };
  const dataText = () => {
    const prompt = batchPrompt(NONCE, {
      sources: dataSources,
      instruction: null,
      zone: "Réservations",
      kinds: ["table", "relations", "fixtures"],
    });
    return `${prompt.system}\n${prompt.user}`;
  };

  it("la consigne nomme les trois types et le vocabulaire des types de champ", () => {
    const text = dataText();
    for (const expected of [
      'kind "table"',
      'kind "relations"',
      'kind "fixtures"',
      "texte(n)",
      "n ↔ n",
    ]) {
      expect(text, expected).toContain(expected);
    }
    expect(text).not.toContain('kind "feature"');
  });

  it("la consigne demande clientSummary : phrases simples pour le client, sans identifiant technique (3.7.0)", () => {
    const text = dataText();
    expect(text).toContain("clientSummary");
    expect(text).toContain("plain sentences");
    expect(text).toContain("no technical identifier");
  });

  it("le cahier fonctionnel et le modèle actuel entrent dans des blocs de données ; jamais le nom du fournisseur", () => {
    const text = dataText();
    for (const expected of [
      "F-001",
      "Réserver une salle",
      "T-salle",
      "Salle",
      "nom",
      "FX-salles",
      "Annulation tardive",
    ]) {
      expect(text, expected).toContain(expected);
    }
    expect(text.toLowerCase()).not.toContain("anthropic");
  });
});

describe("prompts du lot", () => {
  it("les titres existants entrent dans un bloc de données ; la consigne nomme les types demandés", () => {
    const text = textOf(["feature", "rule", "role", "flow"]);
    expect(text).toContain("Annulation tardive");
    expect(text).toContain("Administrateur");
    expect(text).toContain("Inscription");
    expect(text).toContain('kind "rule"');
    expect(text).toContain('kind "role"');
    expect(text).toContain('kind "flow"');
  });

  it("le mode criteria ne parle pas de règles", () => {
    expect(textOf(["criteria"])).not.toContain('kind "rule"');
  });
});

describe("kindsOfMode pour l'Architecture (TK-111)", () => {
  it("complete : composants et flux ; decision : décision ; document : section ; all : les quatre", () => {
    expect(kindsOfMode("complete", "architecture")).toEqual(["component", "archflow"]);
    expect(kindsOfMode("decision", "architecture")).toEqual(["adr"]);
    expect(kindsOfMode("document", "architecture")).toEqual(["doc_section"]);
    expect(kindsOfMode("all", "architecture")).toEqual([
      "component",
      "archflow",
      "adr",
      "doc_section",
    ]);
    expect(kindsOfMode("complete")).toEqual(["feature", "rule", "role", "flow"]);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même livrable, un test par comportement
describe("prompts de l'Architecture (TK-111)", () => {
  const archSources: LaunchSources = {
    ...sources,
    features: [{ specId: "F-001", title: "Réserver une salle", criteria: [] }],
    tables: [{ specId: "T-salle", title: "Salle", zone: "Réservations", fields: ["id", "nom"] }],
    architecture: {
      components: [
        {
          specId: "C-api",
          title: "API",
          zone: "Noyau",
          type: "service",
          owns: ["T-secret-possede"],
          serves: ["F-001"],
        },
      ],
      archflows: [{ specId: "P-annuler", title: "P-annuler" }],
      decisions: [{ specId: "ADR-001", title: "Base relationnelle" }],
      nfr: ["NFR-001"],
    },
  };
  const textOfArch = (kinds: Parameters<typeof batchPrompt>[1]["kinds"]) => {
    const prompt = batchPrompt(NONCE, {
      sources: archSources,
      instruction: "Pas de microservices",
      zone: "Noyau",
      kinds,
    });
    return `${prompt.system}\n${prompt.user}`;
  };

  it("la consigne nomme les types demandés et seulement eux", () => {
    const text = textOfArch(["component", "archflow"]);
    expect(text).toContain('kind "component"');
    expect(text).toContain('kind "archflow"');
    expect(text).not.toContain('kind "adr"');
    expect(text).not.toContain('kind "feature"');
    expect(textOfArch(["adr"])).toContain('kind "adr"');
    expect(textOfArch(["doc_section"])).toContain('kind "doc_section"');
    const all = textOfArch(["component", "archflow", "adr", "doc_section"]);
    for (const kind of ["component", "archflow", "adr", "doc_section"]) {
      expect(all).toContain(`kind "${kind}"`);
    }
  });

  it("le cahier, les tables, l'architecture actuelle et les exigences entrent comme données ; jamais le nom du fournisseur", () => {
    const text = textOfArch(["component"]);
    for (const expected of [
      "F-001",
      "Réserver une salle",
      "T-salle",
      "Annulation tardive",
      "RL-admin",
      "P-inscription",
      "C-api",
      "Noyau",
      "ADR-001",
      "Base relationnelle",
      "P-annuler",
      "NFR-001",
      "Pas de microservices",
    ]) {
      expect(text, expected).toContain(expected);
    }
    expect(text.toLowerCase()).not.toContain("anthropic");
    // TK-114b : les liens d'un composant indexé servent à la couverture, jamais envoyés au modèle.
    expect(text).not.toContain("T-secret-possede");
  });

  it("les zones : consigne d'architecture, sources en données", () => {
    const prompt = zonesPrompt(NONCE, archSources, null);
    const text = `${prompt.system}\n${prompt.user}`;
    expect(text).toContain("architecture");
    expect(text).toContain("C-api");
  });

  it("TK-114e (B670) : les sections de la tête entrent dans le bloc de l'architecture actuelle, consigne constante", () => {
    const withSections: LaunchSources = {
      ...archSources,
      docSections: [{ specId: "DOC-contexte", title: "Contexte général du système" }],
    };
    const ask = (input: LaunchSources) =>
      batchPrompt(NONCE, {
        sources: input,
        instruction: null,
        zone: "Noyau",
        kinds: ["doc_section"],
      });
    const prompt = ask(withSections);
    expect(prompt.user).toContain("Document sections\nDOC-contexte | Contexte général du système");
    expect(prompt.system).not.toContain("Contexte général du système");
    expect(prompt.system).toContain("or the title of an existing decision or document section");
    expect(ask(archSources).system).toBe(prompt.system);
    const all = batchPrompt(NONCE, {
      sources: withSections,
      instruction: null,
      zone: "Noyau",
      kinds: ["component", "archflow", "adr", "doc_section"],
    });
    expect(all.system).toContain("or the title of an existing decision or document section");
    expect(all.system).not.toContain("Contexte général du système");
  });
});
