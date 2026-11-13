import { describe, expect, it } from "vitest";
import {
  criteriaProposalSchema,
  FeatureSchema,
  featureProposalSchema,
  flowProposalSchema,
  isSafeText,
  PROPOSAL_SCHEMAS,
  roleProposalSchema,
  ruleProposalSchema,
  safeText,
} from "../src/index.ts";

/** TK-99a : schémas Zod par type de proposition (sortie du modèle = donnée hostile) et politique de texte brut. */
const CRITERION = {
  title: "Affichage de la liste",
  steps: [
    { type: "etant_donne", text: "un visiteur connecté" },
    { type: "quand", text: "il ouvre la liste" },
    { type: "alors", text: "il voit les éléments" },
  ],
};
const FEATURE = {
  title: "Export CSV",
  priority: "should",
  description: "Exporter.",
  criteria: [CRITERION],
};

describe("politique de texte brut (déplacée depuis l'API)", () => {
  it("refuse lien, balise, image, lien markdown, contrôle et direction", () => {
    for (const bad of [
      "voir https://exemple.fr",
      "<a href=x>",
      "![x](y)",
      "[x](http://y)",
      "a‮b",
      "a\u0007b",
    ]) {
      expect(isSafeText(bad, true), bad).toBe(false);
    }
    expect(isSafeText("a < b et « citation »", false)).toBe(true);
    expect(isSafeText("deux\nlignes", false)).toBe(false);
    expect(isSafeText("deux\nlignes", true)).toBe(true);
    expect(safeText({ min: 1, max: 5 }).safeParse("ok").success).toBe(true);
  });
});

describe("schémas de proposition par type", () => {
  it("expose un schéma par type, dans l'ordre du vocabulaire", () => {
    expect(Object.keys(PROPOSAL_SCHEMAS)).toEqual([
      "feature",
      "criteria",
      "rule",
      "role",
      "flow",
      "table",
      "relations",
      "fixtures",
    ]);
  });

  it("feature : accepte une proposition valide et refuse champ inconnu, lien, balise, critères mal ordonnés", () => {
    expect(featureProposalSchema.safeParse(FEATURE).success).toBe(true);
    expect(featureProposalSchema.safeParse({ ...FEATURE, extra: 1 }).success).toBe(false);
    expect(
      featureProposalSchema.safeParse({ ...FEATURE, title: "Voir https://x.fr" }).success,
    ).toBe(false);
    expect(
      featureProposalSchema.safeParse({ ...FEATURE, description: "<b>gras</b>" }).success,
    ).toBe(false);
    const misordered = {
      ...CRITERION,
      steps: [CRITERION.steps[2], CRITERION.steps[0], CRITERION.steps[1]],
    };
    expect(featureProposalSchema.safeParse({ ...FEATURE, criteria: [misordered] }).success).toBe(
      false,
    );
    expect(featureProposalSchema.safeParse({ ...FEATURE, criteria: [] }).success).toBe(false);
  });

  it("feature : parité avec FeatureSchema du cahier (la proposition devient une fonctionnalité valide)", () => {
    const parsed = featureProposalSchema.parse(FEATURE);
    const asFeature = {
      id: "F-001",
      titre: parsed.title,
      statut: "brouillon",
      priorite: parsed.priority,
      description: parsed.description,
      criteres: parsed.criteria.map((c, i) => ({
        id: `AC-${i + 1}`,
        titre: c.title,
        etapes: c.steps.map((s) => ({ type: s.type, texte: s.text })),
      })),
    };
    expect(FeatureSchema.safeParse(asFeature).success).toBe(true);
  });

  it("criteria : un identifiant de fonctionnalité F-nnn et des critères valides", () => {
    expect(
      criteriaProposalSchema.safeParse({ specId: "F-012", criteria: [CRITERION] }).success,
    ).toBe(true);
    expect(criteriaProposalSchema.safeParse({ specId: "x", criteria: [CRITERION] }).success).toBe(
      false,
    );
    expect(criteriaProposalSchema.safeParse({ specId: "F-012", criteria: [] }).success).toBe(false);
  });

  it("rule, role, flow : prêts (texte brut borné), champs inconnus refusés", () => {
    expect(
      ruleProposalSchema.safeParse({ title: "Annulation", statement: "Sous 24 h." }).success,
    ).toBe(true);
    expect(ruleProposalSchema.safeParse({ title: "A", statement: "[x](http://y)" }).success).toBe(
      false,
    );
    expect(
      roleProposalSchema.safeParse({ name: "Gestionnaire", description: "Gère." }).success,
    ).toBe(true);
    expect(roleProposalSchema.safeParse({ name: "G", description: "d", x: 1 }).success).toBe(false);
    expect(
      flowProposalSchema.safeParse({ title: "Réserver", steps: ["Choisir", "Payer"] }).success,
    ).toBe(true);
    expect(flowProposalSchema.safeParse({ title: "Réserver", steps: [] }).success).toBe(false);
  });
});
