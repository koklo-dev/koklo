import { featurePrioritySchema, featureStatusSchema } from "@koklo/contract";
import { LINK_FIELDS } from "./feature-form.ts";

/**
 * Validation stricte de ce qui est relu dans `localStorage` (S-feature-form §5.5) : le stockage est modifiable
 * par la personne et par d'anciennes versions ; tout ce qui ne correspond pas exactement est ignoré.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const STEP_TYPES: readonly unknown[] = ["etant_donne", "quand", "alors", "et"];
const SPEC_ID = /^F-\d{3,}$/;
const CRITERION_ID = /^AC-\d+$/;
const COMMIT_SHA = /^[0-9a-f]{7,64}$/i;
const MAX_TEXT = 100_000;
const MAX_ITEMS = 500;

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.length <= MAX_TEXT;
const isOptional = (value: unknown, check: (v: unknown) => boolean): boolean =>
  value === undefined || check(value);

function isStep(value: unknown): boolean {
  return isRecord(value) && STEP_TYPES.includes(value.type) && isText(value.text);
}

function isCriterion(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOptional(value.id, (id) => typeof id === "string" && CRITERION_ID.test(id)) &&
    isOptional(value.key, isText) &&
    isText(value.title) &&
    Array.isArray(value.steps) &&
    value.steps.length <= MAX_ITEMS &&
    value.steps.every(isStep)
  );
}

export function isFormValues(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isText(value.title) &&
    (value.priority === "" || featurePrioritySchema.safeParse(value.priority).success) &&
    featureStatusSchema.safeParse(value.status).success &&
    isText(value.description) &&
    Array.isArray(value.criteria) &&
    value.criteria.length <= MAX_ITEMS &&
    value.criteria.every(isCriterion) &&
    LINK_FIELDS.every((field) => isText(value[field]))
  );
}

const isNullOr = (value: unknown, check: (v: unknown) => boolean): boolean =>
  value === null || check(value);

/** Un brouillon complet (sans le propriétaire, vérifié à part). */
export function isDraft(data: Record<string, unknown>): boolean {
  return (
    isFormValues(data.values) &&
    isNullOr(data.baseline, isFormValues) &&
    isNullOr(data.baseCommitSha, (v) => typeof v === "string" && COMMIT_SHA.test(v)) &&
    isNullOr(data.idempotencyKey, (v) => typeof v === "string" && v.length > 0 && v.length <= 200)
  );
}

/** Un marqueur de suivi complet. */
export function isPending(data: Record<string, unknown>): boolean {
  return (
    typeof data.batchId === "string" &&
    data.batchId.length > 0 &&
    data.batchId.length <= 100 &&
    (data.kind === "create" || data.kind === "update" || data.kind === "delete") &&
    isOptional(data.specId, (v) => typeof v === "string" && SPEC_ID.test(v)) &&
    isText(data.title)
  );
}
