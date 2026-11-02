import type { CriterionValue } from "./feature-form.ts";
import { EMPTY_VALUES, type FormIssue, validateFeatureForm } from "./feature-form.ts";
import type { ProposedFeature } from "./framing-types.ts";

/**
 * Validation d'une proposition : les règles du formulaire de fonctionnalité (titre, critères, étapes), sans les
 * liens que l'écran de cadrage n'édite pas (S-framing §3.5).
 */
const DESCRIPTION_MAX = 4000;
export const ORDER_WARNING = "L'ordre habituel est Étant donné, Quand, Alors.";

const LINK_FIELDS = /^(screens|roles|rules|tables|endpoints|nfr|status)$/;

/** Champs d'édition d'une proposition : critères avec une clé d'affichage stable. */
export interface EditValues {
  title: string;
  priority: ProposedFeature["priority"];
  description: string;
  criteria: CriterionValue[];
}

export const toEditValues = (value: ProposedFeature): EditValues => ({
  title: value.title,
  priority: value.priority,
  description: value.description,
  criteria: value.criteria.map((criterion, index) => ({
    key: `edit-${index}`,
    title: criterion.title,
    steps: criterion.steps.map((step) => ({ type: step.type, text: step.text })),
  })),
});

export const fromEditValues = (edit: EditValues): ProposedFeature => ({
  kind: "feature.create",
  title: edit.title,
  priority: edit.priority,
  description: edit.description,
  criteria: edit.criteria.map((criterion) => ({
    title: criterion.title,
    steps: criterion.steps.map((step) => ({ type: step.type, text: step.text })),
  })),
});

export function validateEdit(edit: EditValues): FormIssue[] {
  const issues = validateFeatureForm({ ...EMPTY_VALUES, ...edit }).filter(
    (issue) => !LINK_FIELDS.test(issue.field),
  );
  if (edit.description.length > DESCRIPTION_MAX) {
    issues.push({
      field: "description",
      message: `La description ne doit pas dépasser ${DESCRIPTION_MAX} caractères.`,
    });
  }
  return issues;
}

export const isValidProposal = (value: ProposedFeature): boolean =>
  validateEdit(toEditValues(value)).length === 0;

const RANK: Record<string, number> = { etant_donne: 0, quand: 1, alors: 2 };

/** Vrai quand les étapes ne suivent pas Étant donné -> Quand -> Alors (« Et » est neutre) : signalé, non bloquant. */
export function stepOrderBroken(steps: ReadonlyArray<{ type: string }>): boolean {
  let highest = -1;
  for (const step of steps) {
    const rank = RANK[step.type];
    if (rank === undefined) continue;
    if (rank < highest) return true;
    highest = rank;
  }
  return false;
}
