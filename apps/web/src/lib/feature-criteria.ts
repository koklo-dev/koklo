import type { CriterionValue, StepValue } from "./feature-form.ts";
import type { StepType } from "./feature-labels.ts";

/** Opérations pures de l'éditeur de critères (S-feature-form §3.3). */
const STEP_ORDER: readonly StepType[] = ["etant_donne", "quand", "alors"];

let counter = 0;
const newKey = (): string => `new-${++counter}`;

/** Le type proposé suit Étant donné, Quand, Alors, puis Et. */
export const nextStepType = (steps: StepValue[]): StepType => STEP_ORDER[steps.length] ?? "et";

/** Clé React stable d'un critère, avant comme après le changement de son titre. */
export const criterionKey = (criterion: CriterionValue, index: number): string =>
  criterion.key ?? criterion.id ?? `position-${index}`;

export const addCriterion = (list: CriterionValue[]): CriterionValue[] => [
  ...list,
  { key: newKey(), title: "", steps: [] },
];

export const removeAt = <T>(list: T[], index: number): T[] => list.filter((_, i) => i !== index);

export function moveCriterion(list: CriterionValue[], index: number, delta: -1 | 1) {
  const target = index + delta;
  const moved = list[index];
  const other = list[target];
  if (!moved || !other) return list;
  const next = [...list];
  next[index] = other;
  next[target] = moved;
  return next;
}

/** Remplace un critère en gardant sa clé d'affichage (changer son titre ne le remonte pas). */
export function patchCriterion(
  list: CriterionValue[],
  index: number,
  patch: Partial<Pick<CriterionValue, "title" | "steps">>,
): CriterionValue[] {
  return list.map((item, i) =>
    i === index ? { ...item, key: criterionKey(item, i), ...patch } : item,
  );
}

/** Vrai quand un critère existant a un autre titre que celui lu : il recevra un nouvel identifiant. */
export function isRenamed(criterion: CriterionValue, original: CriterionValue[] | null): boolean {
  if (!criterion.id) return false;
  const before = original?.find((candidate) => candidate.id === criterion.id);
  return before !== undefined && before.title.trim() !== criterion.title.trim();
}
