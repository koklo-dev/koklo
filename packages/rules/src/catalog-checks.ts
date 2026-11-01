import type { CatalogError } from "./catalog-error.ts";
import { ENFORCEMENT_KINDS } from "./catalog-schema.ts";
import type { Catalog } from "./catalog-types.ts";

export type Check = CatalogError | undefined;

const fail = (code: CatalogError["code"], message: string, path?: string): CatalogError =>
  path === undefined ? { code, message } : { code, message, path };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const checkRawEnforcement = (rule: Record<string, unknown>, index: number): Check => {
  const path = `rules.${index}.enforcement`;
  if (!("enforcement" in rule)) {
    return fail("catalog.missing-enforcement", `rule ${index} has no enforcement`, path);
  }
  const enforcement = rule.enforcement;
  if (!isRecord(enforcement) || !("kind" in enforcement)) return undefined;
  if (ENFORCEMENT_KINDS.some((kind) => kind === enforcement.kind)) return undefined;
  return fail(
    "catalog.unknown-enforcement",
    `rule ${index}: unknown enforcement kind`,
    `${path}.kind`,
  );
};

// Avant le schéma : une règle protégée hors liste est un désaccord, pas une forme invalide.
const checkRawProtected = (rule: Record<string, unknown>, index: number, listed: unknown): Check =>
  rule.protected === true && !(Array.isArray(listed) && listed.includes(rule.id))
    ? fail(
        "catalog.protected-mismatch",
        `rule ${String(rule.id)} is protected but not listed`,
        `rules.${index}.protected`,
      )
    : undefined;

/** Contrôles sur le JSON brut, avant le schéma : version, puis protégées et enforcement par règle. */
export const checkRawDocument = (doc: unknown): Check => {
  if (!isRecord(doc)) return undefined;
  if ("schema_version" in doc && doc.schema_version !== 1) {
    return fail("catalog.unknown-version", "schema_version must be 1", "schema_version");
  }
  if (!Array.isArray(doc.rules)) return undefined;
  for (const [index, rule] of doc.rules.entries()) {
    if (!isRecord(rule)) continue;
    const found =
      checkRawProtected(rule, index, doc.protected_rule_ids) ?? checkRawEnforcement(rule, index);
    if (found !== undefined) return found;
  }
  return undefined;
};

const checkDuplicateIds = (catalog: Catalog): Check => {
  const seen = new Set<string>();
  for (const [index, rule] of catalog.rules.entries()) {
    if (seen.has(rule.id)) {
      return fail("catalog.duplicate-id", `duplicate rule id ${rule.id}`, `rules.${index}.id`);
    }
    seen.add(rule.id);
  }
  return undefined;
};

const checkProfiles = (catalog: Catalog): Check => {
  for (const [index, rule] of catalog.rules.entries()) {
    for (const [at, profile] of rule.profiles.entries()) {
      if (!(profile in catalog.profiles)) {
        return fail(
          "catalog.unknown-profile",
          `rule ${rule.id}: unknown profile ${profile}`,
          `rules.${index}.profiles.${at}`,
        );
      }
    }
  }
  return undefined;
};

const checkProtected = (catalog: Catalog): Check => {
  const ids = new Set(catalog.rules.map((rule) => rule.id));
  for (const [index, id] of catalog.protectedRuleIds.entries()) {
    if (!ids.has(id)) {
      return fail(
        "catalog.unknown-protected-id",
        `unknown protected id ${id}`,
        `protected_rule_ids.${index}`,
      );
    }
  }
  const listed = new Set(catalog.protectedRuleIds);
  for (const [index, rule] of catalog.rules.entries()) {
    if (rule.protected !== listed.has(rule.id)) {
      return fail(
        "catalog.protected-mismatch",
        `rule ${rule.id}: protected flag and protected_rule_ids disagree`,
        `rules.${index}.protected`,
      );
    }
  }
  return undefined;
};

/** Contrôles sémantiques sur le catalogue typé, dans l'ordre : doublons, profils, protégées. */
export const checkSemantics = (catalog: Catalog): Check =>
  checkDuplicateIds(catalog) ?? checkProfiles(catalog) ?? checkProtected(catalog);
