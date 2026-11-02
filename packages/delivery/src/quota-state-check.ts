import { fail, isEpoch, isObject, isSafeCount } from "./quota-check.ts";
import {
  QUOTA_STATUSES,
  type QuotaState,
  type QuotaStatus,
  type WindowCount,
} from "./quota-state.ts";
import { QUOTA_MAX_SEEN_IDS } from "./quota-usage-check.ts";
import { isText } from "./value-check.ts";

/** Clés triées : la sérialisation est stable. */
const STATE_KEYS = [
  "consecutiveHits",
  "lastHitAt",
  "lastSignalId",
  "resumeAt",
  "status",
  "usageIds",
  "version",
  "windows",
];
const WINDOW_KEYS = ["runs", "start", "tokens"];
/** Pas de `/` dans l'organisation (premier `/` = séparateur), donc pas de clé ambiguë. */
const WINDOW_KEY = /^(?:o:[^/]+|[pa]:[^/]+\/.+)$/;

const assertKeys = (value: Record<string, unknown>, expected: readonly string[]): void => {
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) {
    fail("clés inattendues ou manquantes");
  }
};

const nullableEpoch = (value: unknown): number | null =>
  value === null ? null : isEpoch(value) ? value : fail("instant persisté invalide");

const checkWindow = (value: unknown): WindowCount => {
  if (!isObject(value)) return fail("fenêtre invalide");
  assertKeys(value, WINDOW_KEYS);
  const { runs, start, tokens } = value;
  if (!isSafeCount(runs) || !isSafeCount(start) || !isSafeCount(tokens)) {
    return fail("fenêtre invalide");
  }
  return { runs, start, tokens };
};

const checkWindows = (value: unknown): Record<string, WindowCount> => {
  if (!isObject(value)) return fail("fenêtres invalides");
  const entries = Object.keys(value)
    .sort()
    .map((key) => [
      WINDOW_KEY.test(key) ? key : fail("clé de fenêtre invalide"),
      checkWindow(value[key]),
    ]);
  return Object.fromEntries(entries);
};

const checkUsageIds = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length > QUOTA_MAX_SEEN_IDS) return fail("usageIds invalide");
  return value.map((id) => (isText(id) ? id : fail("usageIds invalide")));
};

const checkStatus = (value: unknown): QuotaStatus =>
  QUOTA_STATUSES.find((status) => status === value) ?? fail("statut inconnu");

/** Validation stricte d'un état venu de l'extérieur ; renvoie une copie gelée aux clés triées. */
export const checkQuotaState = (value: unknown): QuotaState => {
  if (!isObject(value)) return fail("état de quota absent");
  assertKeys(value, STATE_KEYS);
  const status = checkStatus(value.status);
  const resumeAt = nullableEpoch(value.resumeAt);
  if ((status === "backoff") !== (resumeAt !== null)) fail("statut et resumeAt incohérents");
  if (value.lastSignalId !== null && !isText(value.lastSignalId)) fail("lastSignalId invalide");
  if (!isSafeCount(value.consecutiveHits) || !isSafeCount(value.version)) {
    fail("compteur invalide");
  }
  return {
    consecutiveHits: value.consecutiveHits,
    lastHitAt: nullableEpoch(value.lastHitAt),
    lastSignalId: value.lastSignalId as string | null,
    resumeAt,
    status,
    usageIds: checkUsageIds(value.usageIds),
    version: value.version,
    windows: checkWindows(value.windows),
  };
};
