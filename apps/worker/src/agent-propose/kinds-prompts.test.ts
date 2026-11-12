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
