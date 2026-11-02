import { featureIdSchema, featurePrioritySchema } from "@koklo/contract";
import {
  FRAMING_DRAFT_PREFIX,
  readStored,
  removeStored,
  type StorageScope,
  withOwner,
  writeStored,
} from "./feature-draft.ts";
import { isCriterion, isRecord } from "./feature-draft-schema.ts";
import type { FramingDraft } from "./framing-types.ts";

/**
 * Brouillon local de cadrage, cloisonné par compte et organisation (S-framing §5.3) : même enveloppe, même
 * expiration (7 jours) et même purge à la fin de session que les brouillons de fonctionnalité.
 * Le contenu relu est traité comme non fiable : schéma strict, sinon la clé est supprimée.
 */
export { FRAMING_DRAFT_PREFIX };
export const FRAMING_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const framingDraftKey = (projectId: string): string => `${FRAMING_DRAFT_PREFIX}${projectId}`;

const MAX_TEXT = 100_000;
const MAX_PROPOSALS = 100;
const STATUSES: readonly unknown[] = ["to_review", "accepted", "rejected"];
const BRIEF_KEYS = [
  "title",
  "problem",
  "users",
  "expectedOutcome",
  "constraints",
  "openQuestions",
] as const;

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.length <= MAX_TEXT;

function isFeature(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.kind === "feature.create" &&
    isText(value.title) &&
    featurePrioritySchema.safeParse(value.priority).success &&
    isText(value.description) &&
    Array.isArray(value.criteria) &&
    value.criteria.length <= 500 &&
    value.criteria.every(isCriterion)
  );
}

function isProposal(value: unknown): boolean {
  return (
    isRecord(value) &&
    isText(value.id) &&
    STATUSES.includes(value.status) &&
    isFeature(value.value) &&
    isFeature(value.original) &&
    (value.duplicateOf === null || featureIdSchema.safeParse(value.duplicateOf).success)
  );
}

const isBrief = (value: unknown): boolean =>
  value === null || (isRecord(value) && BRIEF_KEYS.every((key) => isText(value[key])));

function isFramingDraft(data: Record<string, unknown>): boolean {
  return (
    (data.mode === "idea" || data.mode === "brief") &&
    isText(data.idea) &&
    isText(data.clarifications) &&
    isText(data.pastedBrief) &&
    isBrief(data.brief) &&
    Array.isArray(data.answers) &&
    data.answers.length <= 100 &&
    data.answers.every(isText) &&
    Array.isArray(data.proposals) &&
    data.proposals.length <= MAX_PROPOSALS &&
    data.proposals.every(isProposal)
  );
}

export const saveFramingDraft = (
  scope: StorageScope | null,
  projectId: string,
  draft: FramingDraft,
): boolean => (scope ? writeStored(framingDraftKey(projectId), withOwner(scope, draft)) : false);

export const readFramingDraft = (
  scope: StorageScope | null,
  projectId: string,
  now: number = Date.now(),
): FramingDraft | null =>
  readStored(
    framingDraftKey(projectId),
    scope,
    now,
    FRAMING_DRAFT_TTL_MS,
    isFramingDraft,
  ) as FramingDraft | null;

export const clearFramingDraft = (projectId: string): void =>
  removeStored(framingDraftKey(projectId));
