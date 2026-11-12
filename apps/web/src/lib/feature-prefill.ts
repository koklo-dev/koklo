import type { AiPrefillItemOutput } from "@koklo/contract";
import type { CriterionValue, FeatureFormValues } from "./feature-form.ts";
import { fieldOfTag, linkTags, patchForTags } from "./feature-links.ts";

type Prefilled = AiPrefillItemOutput["values"];
export type PrefilledKey = "title" | "priority" | "description" | "criteria" | "links";

let counter = 0;
const fromAgent = (criteria: NonNullable<Prefilled["criteria"]>): CriterionValue[] =>
  criteria.map((criterion) => ({
    key: `agent-${++counter}`,
    title: criterion.title,
    steps: criterion.steps.map((step) => ({ type: step.type, text: step.text })),
  }));

/**
 * Ce que le préremplissage change : seulement les champs vides (B329 h). Les liens dont le préfixe n'est pas
 * admis (`F-`, `P-`) sont ignorés. Renvoie le correctif et les champs marqués.
 */
export function prefillPatch(
  values: FeatureFormValues,
  proposed: Prefilled,
): { values: Partial<FeatureFormValues>; keys: PrefilledKey[] } {
  const patch: Partial<FeatureFormValues> = {};
  const keys: PrefilledKey[] = [];
  const take = <K extends PrefilledKey>(key: K, apply: () => void): void => {
    apply();
    keys.push(key);
  };
  if (proposed.title && !values.title.trim())
    take("title", () => (patch.title = proposed.title ?? ""));
  if (proposed.priority && values.priority === "") {
    take("priority", () => (patch.priority = proposed.priority ?? ""));
  }
  if (proposed.description && !values.description.trim()) {
    take("description", () => (patch.description = proposed.description ?? ""));
  }
  if (proposed.criteria?.length && values.criteria.length === 0) {
    take("criteria", () => (patch.criteria = fromAgent(proposed.criteria ?? [])));
  }
  const tags = (proposed.links ?? []).filter((tag) => fieldOfTag(tag) !== null);
  if (tags.length > 0 && linkTags(values).length === 0) {
    take("links", () => Object.assign(patch, patchForTags(values, tags)));
  }
  return { values: patch, keys };
}
