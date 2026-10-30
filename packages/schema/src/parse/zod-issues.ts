import type { z } from "zod";
import { structIssue } from "../issue.ts";
import { escapePointerSegment } from "../pointer.ts";
import type { Issue } from "../types.ts";

/** Chemin Zod -> pointeur JSON (RFC 6901) ; "" désigne la racine. */
export function toPointer(path: readonly PropertyKey[]): string {
  return path.map((segment) => `/${escapePointerSegment(String(segment))}`).join("");
}

export type EntityParse<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

/** Valide `data` ; une issue STRUCT_SCHEMA_VIOLATION par erreur Zod. */
export function parseWithSchema<S extends z.ZodType>(
  schema: S,
  path: string,
  data: unknown,
  entityId?: string,
): EntityParse<z.output<S>> {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, value: result.data };
  const issues = result.error.issues.map((issue) => {
    const pointer = toPointer(issue.path);
    const message = `Violation du schéma${pointer === "" ? "" : ` en ${pointer}`} : ${issue.message}.`;
    return structIssue("STRUCT_SCHEMA_VIOLATION", path, message, pointer, entityId);
  });
  return { ok: false, issues };
}

/** Identifiant brut d'une donnée non validée, pour étiqueter les issues. */
export function rawId(data: unknown, key = "id"): string | undefined {
  if (data === null || typeof data !== "object") return undefined;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}
