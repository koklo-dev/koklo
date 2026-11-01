export { loadBuiltInCatalog } from "./builtin-catalog.ts";
export type { CatalogError, CatalogErrorCode, CatalogResult } from "./catalog-error.ts";
export { CATALOG_ERROR_CODES } from "./catalog-error.ts";
export { catalogSchema, enforcementSchema, profileSchema, ruleSchema } from "./catalog-schema.ts";
export type {
  AgentRole,
  Catalog,
  Enforcement,
  Profile,
  ProfileKind,
  Rule,
  Severity,
} from "./catalog-types.ts";
export { AGENT_ROLES, PROFILE_KINDS } from "./catalog-types.ts";
export { renderExplanation } from "./explain.ts";
export type {
  AppliedWaiver,
  Attempt,
  Conflict,
  ConflictReason,
  DisabledRule,
  EffectiveRule,
  LayerLevel,
  LayerRule,
  Level,
  Override,
  PackageProfiles,
  RuleLayer,
  Trace,
  TraceKind,
  Waiver,
} from "./layer-types.ts";
export { CONFLICT_REASONS, LEVELS } from "./layer-types.ts";
export { MAX_CATALOG_BYTES, parseCatalog } from "./parse-catalog.ts";
export { parseLayer, parseWaivers } from "./parse-layer.ts";
export { resolveEffectiveRules } from "./resolve.ts";
export type { Resolution, ResolveInput } from "./resolve-types.ts";
export type { RulesError, RulesErrorCode, RulesResult } from "./rules-error.ts";
export { RULES_ERROR_CODES } from "./rules-error.ts";
export { isValidPattern, matchesAny, matchesPath, normalizePath } from "./scope-match.ts";
export type { Strength } from "./strength.ts";
export { isWeaker } from "./strength.ts";
