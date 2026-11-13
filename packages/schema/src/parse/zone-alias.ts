import { structIssue } from "../issue.ts";
import type { Issue } from "../types.ts";

export type AliasResult = { ok: true; data: unknown } | { ok: false; issues: Issue[] };

/**
 * `domaine:` est un alias lu de `zone:` (B9) : renvoie la donnée avec `zone`, jamais `domaine`.
 * Les deux clés présentes et différentes sont une violation de schéma. La donnée n'est pas mutée.
 */
export function applyZoneAlias(path: string, data: unknown, entityId?: string): AliasResult {
  if (data === null || typeof data !== "object" || Array.isArray(data) || !("domaine" in data)) {
    return { ok: true, data };
  }
  const { domaine, ...rest } = data as Record<string, unknown>;
  if ("zone" in rest && rest.zone !== domaine) {
    const message =
      "Violation du schéma en /domaine : `zone` et son alias `domaine` sont présents avec des valeurs différentes.";
    return {
      ok: false,
      issues: [structIssue("STRUCT_SCHEMA_VIOLATION", path, message, "/domaine", entityId)],
    };
  }
  return { ok: true, data: { ...rest, zone: domaine } };
}
