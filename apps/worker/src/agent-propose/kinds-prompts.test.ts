import { describe, expect, it } from "vitest";
import { kindsOfMode } from "./generate.ts";
import { batchPrompt } from "./prompts.ts";
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
