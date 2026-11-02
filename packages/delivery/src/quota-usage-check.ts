import { fail, isObject, isPositiveInt, isSafeCount } from "./quota-check.ts";
import type { QuotaScope, Usage, UsageCaps, UsagePolicy } from "./quota-policy.ts";
import { isText } from "./value-check.ts";

/** Borne de la liste d'ids d'usage déjà comptés (D8). */
export const QUOTA_MAX_SEEN_IDS = 1000;

const optionalText = (value: unknown): boolean => value === undefined || isText(value);

/** Une organisation ne contient pas `/` : les clés `p:<org>/<projet>` restent sans ambiguïté. */
export const assertScope = (scope: QuotaScope): void => {
  if (!isObject(scope)) fail("scope absent");
  if (!isText(scope.organization) || scope.organization.includes("/")) {
    fail("organisation invalide");
  }
  if (!optionalText(scope.project) || !optionalText(scope.agent)) fail("projet ou agent invalide");
};

const assertCaps = (caps: UsageCaps | undefined): void => {
  if (caps === undefined) return;
  if (!isObject(caps)) fail("plafond invalide");
  for (const cap of [caps.maxRuns, caps.maxTokens]) {
    if (cap !== undefined && !isSafeCount(cap)) fail("plafond invalide");
  }
};

export const assertUsagePolicy = (policy: UsagePolicy): void => {
  if (!isObject(policy)) fail("politique de consommation absente");
  if (!isPositiveInt(policy.windowMs)) fail("windowMs invalide");
  if (!isPositiveInt(policy.maxSeenIds) || policy.maxSeenIds > QUOTA_MAX_SEEN_IDS) {
    fail("maxSeenIds invalide");
  }
  assertCaps(policy.organization);
  assertCaps(policy.project);
  assertCaps(policy.agent);
};

export const assertUsage = (usage: Usage): void => {
  if (!isObject(usage)) fail("usage absent");
  if (!isText(usage.id)) fail("identifiant d'usage invalide");
  assertScope(usage.scope);
  if (!isSafeCount(usage.runs) || !isSafeCount(usage.tokens)) fail("runs ou tokens invalide");
};
