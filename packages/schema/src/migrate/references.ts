import { emitFeatureMarkdown } from "../emit/feature-markdown.ts";
import { emitRolesYaml } from "../emit/roles-yaml.ts";
import { emitRuleMarkdown } from "../emit/rule-markdown.ts";
import { structIssue } from "../issue.ts";
import type { Issue, ParsedSpec, SpecFile } from "../types.ts";
import { type MigrationResult, writeOf } from "./types.ts";

const SCREEN_ENDPOINT = /("endpoint"\s*:\s*")([^"]*)(")/g;

/** Résolution des références d'endpoint : l'identifiant v1 `E-<slug>` devient `zone.verbe` ; inconnu = refus consigné. */
class Resolver {
  readonly issues: Issue[] = [];
  constructor(private readonly ids: ReadonlyMap<string, string>) {}

  one(path: string, id: string): string {
    const next = this.ids.get(id);
    if (next !== undefined) return next;
    if (!id.startsWith("E-")) return id;
    const message = `Migration refusée : ${id} cité dans ${path} n'est défini dans aucun fichier d'endpoint.`;
    this.issues.push(structIssue("STRUCT_MIGRATION_UNKNOWN_REFERENCE", path, message, "", id));
    return id;
  }

  list(path: string, ids: readonly string[]): string[] {
    return ids.map((id) => this.one(path, id));
  }
}

const differs = (a: readonly string[], b: readonly string[]): boolean =>
  a.some((value, index) => value !== b[index]);

function emitSafely(path: string, issues: Issue[], build: () => string): string | undefined {
  try {
    return build();
  } catch (error) {
    const message = error instanceof Error ? error.message : "émission impossible";
    issues.push(structIssue("STRUCT_SCHEMA_VIOLATION", path, message));
    return undefined;
  }
}

function featureChanges(spec: ParsedSpec, resolver: Resolver, changes: MigrationResult["changes"]) {
  for (const { path, value } of spec.features) {
    const endpoints = resolver.list(path, value.endpoints);
    if (!differs(value.endpoints, endpoints)) continue;
    const text = emitSafely(path, resolver.issues, () =>
      emitFeatureMarkdown({ ...value, endpoints }),
    );
    if (text !== undefined) changes.push(writeOf(path, text));
  }
}

function ruleChanges(spec: ParsedSpec, resolver: Resolver, changes: MigrationResult["changes"]) {
  for (const { path, value } of spec.rules) {
    const endpoints = resolver.list(path, value.endpoints);
    if (!differs(value.endpoints, endpoints)) continue;
    const text = emitSafely(path, resolver.issues, () => emitRuleMarkdown({ ...value, endpoints }));
    if (text !== undefined) changes.push(writeOf(path, text));
  }
}

function roleChanges(spec: ParsedSpec, resolver: Resolver, changes: MigrationResult["changes"]) {
  for (const { path, value } of spec.roles) {
    const permissions = value.permissions.map((permission) => ({
      ...permission,
      ressource: permission.ressource.startsWith("E-")
        ? resolver.one(path, permission.ressource)
        : permission.ressource,
      endpoints: resolver.list(path, permission.endpoints),
    }));
    const changed = permissions.some(
      (permission, index) =>
        permission.ressource !== value.permissions[index]?.ressource ||
        differs(value.permissions[index]?.endpoints ?? [], permission.endpoints),
    );
    if (!changed) continue;
    const text = emitSafely(path, resolver.issues, () => emitRolesYaml({ ...value, permissions }));
    if (text !== undefined) changes.push(writeOf(path, text));
  }
}

/** Écrans JSON : seul le texte de l'annotation change, la mise en forme du fichier est conservée. */
function screenChanges(
  spec: ParsedSpec,
  files: readonly SpecFile[],
  resolver: Resolver,
  changes: MigrationResult["changes"],
) {
  const content = new Map(files.map((file) => [file.path, file.content]));
  for (const { path } of spec.screens) {
    const before = content.get(path) ?? "";
    const after = before.replace(
      SCREEN_ENDPOINT,
      (_all, open: string, id: string, close: string) => `${open}${resolver.one(path, id)}${close}`,
    );
    if (after !== before) changes.push(writeOf(path, after));
  }
}

/** Réécrit les références d'endpoint des fonctionnalités, règles, rôles et écrans ; un identifiant inconnu refuse la migration. */
export function planReferences(
  spec: ParsedSpec,
  files: readonly SpecFile[],
  ids: ReadonlyMap<string, string>,
): MigrationResult {
  const resolver = new Resolver(ids);
  const changes: MigrationResult["changes"] = [];
  featureChanges(spec, resolver, changes);
  ruleChanges(spec, resolver, changes);
  roleChanges(spec, resolver, changes);
  screenChanges(spec, files, resolver, changes);
  return { changes, issues: resolver.issues };
}
