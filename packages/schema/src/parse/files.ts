import type { Feature } from "../entities/index.ts";
import { compare, sortIssues, structIssue } from "../issue.ts";
import type { Issue, Parsed, ParsedSpec, SpecFile } from "../types.ts";
import { parseFeatureMarkdown } from "./feature-markdown.ts";
import { idKey, idMatchesFile, type Kind, kindOf, SCHEMAS } from "./kinds.ts";
import { loadJson, loadYaml } from "./yaml.ts";
import { parseWithSchema, rawId } from "./zod-issues.ts";

type FileResult = { ok: true; value: unknown; id?: string } | { ok: false; issues: Issue[] };

function checkVersion(path: string, data: unknown): Issue | undefined {
  if (data === null || typeof data !== "object" || !("spec_version" in data)) return undefined;
  if (data.spec_version === 1) return undefined;
  const message = `Version de spec non prise en charge : ${JSON.stringify(data.spec_version)} (seule la version 1 l'est).`;
  return structIssue("STRUCT_UNSUPPORTED_SPEC_VERSION", path, message, "/spec_version");
}

function parseOne(file: SpecFile, kind: Kind): FileResult {
  if (kind === "feature") {
    const result = parseFeatureMarkdown(file.path, file.content);
    return result.ok ? { ok: true, value: result.value, id: result.value.id } : result;
  }
  const loaded =
    kind === "screen" ? loadJson(file.path, file.content) : loadYaml(file.path, file.content);
  if (!loaded.ok) return loaded;
  const versionIssue = kind === "project" ? checkVersion(file.path, loaded.data) : undefined;
  if (versionIssue) return { ok: false, issues: [versionIssue] };
  const id = rawId(loaded.data, idKey(kind));
  const result = parseWithSchema(SCHEMAS[kind], file.path, loaded.data, id);
  return result.ok ? { ok: true, value: result.value, id } : result;
}

const stem = (path: string) => path.replace(/\.[^./]*$/, "");
/** Ordre stable : chemin sans extension, puis chemin complet (S-register avant S-register-success). */
const byPath = (a: SpecFile, b: SpecFile) =>
  compare(stem(a.path), stem(b.path)) || compare(a.path, b.path);

const IDENTIFIED = new Set<Kind>(["feature", "table", "endpoint", "screen"]);

const empty = (): ParsedSpec => ({
  features: [],
  tables: [],
  relations: [],
  endpoints: [],
  screens: [],
  tests: [],
});

/** Range une entité valide dans la bonne liste du snapshot. */
function place(spec: ParsedSpec, kind: Kind, path: string, value: unknown): void {
  const entry = { path, value } as Parsed<never>;
  if (kind === "project") spec.project = entry;
  else if (kind === "feature") spec.features.push(entry as Parsed<Feature>);
  else if (kind === "table") spec.tables.push(entry);
  else if (kind === "relations") spec.relations.push(entry);
  else if (kind === "endpoint") spec.endpoints.push(entry);
  else if (kind === "screen") spec.screens.push(entry);
  else spec.tests.push(entry);
}

/**
 * Texte -> entités. Fichiers traités par chemin croissant ; une entité en échec est exclue de
 * `spec` et signalée ; le premier identifiant rencontré gagne, les doublons sont signalés.
 */
export function parseSpecFiles(files: readonly SpecFile[]): { spec: ParsedSpec; issues: Issue[] } {
  const spec = empty();
  const issues: Issue[] = [];
  const claimed = new Map<string, string>();
  const ordered = [...files].sort(byPath);
  for (const file of ordered) {
    const kind = kindOf(file.path);
    if (kind === undefined) continue;
    const result = parseOne(file, kind);
    if (!result.ok) {
      issues.push(...result.issues);
      continue;
    }
    const id = IDENTIFIED.has(kind) ? result.id : undefined;
    if (id !== undefined && !idMatchesFile(file.path, id)) {
      const message = `L'identifiant ${id} ne correspond pas au nom du fichier ${file.path}.`;
      issues.push(structIssue("STRUCT_ID_MISMATCH", file.path, message, "/id", id));
      continue;
    }
    if (id !== undefined) {
      const key = `${kind}:${id}`;
      const first = claimed.get(key);
      if (first !== undefined) {
        const message = `L'identifiant ${id} est déjà défini par ${first}.`;
        issues.push(structIssue("STRUCT_DUPLICATE_ID", file.path, message, "/id", id));
        continue;
      }
      claimed.set(key, file.path);
    }
    place(spec, kind, file.path, result.value);
  }
  return { spec, issues: sortIssues(issues) };
}
