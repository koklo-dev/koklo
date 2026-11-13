import type { BusinessRule, Feature, Fixture, Flow, RolesFile } from "../entities/index.ts";
import { compare, sortIssues, structIssue } from "../issue.ts";
import type { Issue, Parsed, ParsedSpec, SpecFile } from "../types.ts";
import { parseFeatureMarkdown } from "./feature-markdown.ts";
import {
  idKey,
  idMatchesFile,
  isTableDirPath,
  type Kind,
  kindOf,
  type SpecVersion,
  schemaFor,
} from "./kinds.ts";
import { duplicateIdIssues } from "./roles-file.ts";
import { parseRuleMarkdown } from "./rule-markdown.ts";
import { loadJson, loadYaml } from "./yaml.ts";
import { parseWithSchema, rawId } from "./zod-issues.ts";
import { applyZoneAlias } from "./zone-alias.ts";

type FileResult = { ok: true; value: unknown; id?: string } | { ok: false; issues: Issue[] };

function checkVersion(path: string, data: unknown): Issue | undefined {
  if (data === null || typeof data !== "object" || !("spec_version" in data)) return undefined;
  if (data.spec_version === 1 || data.spec_version === 2) return undefined;
  const message = `Version de spec non prise en charge : ${JSON.stringify(data.spec_version)} (les versions 1 et 2 le sont).`;
  return structIssue("STRUCT_UNSUPPORTED_SPEC_VERSION", path, message, "/spec_version");
}

/** Version du format, lue du manifeste : 2 seulement si `spec_version: 2`, sinon 1 (absente, invalide ou refusée plus loin). */
function specVersionOf(files: readonly SpecFile[]): SpecVersion {
  const manifest = files.find((file) => file.path === "koklo.project.yaml");
  const loaded = manifest ? loadYaml(manifest.path, manifest.content) : undefined;
  const data = loaded?.ok ? loaded.data : undefined;
  return data !== null &&
    typeof data === "object" &&
    "spec_version" in data &&
    data.spec_version === 2
    ? 2
    : 1;
}

/** Entité décrite par un fichier YAML ou JSON : alias `domaine`, schéma selon la version. */
function parseData(file: SpecFile, kind: Kind, version: SpecVersion): FileResult {
  const loaded =
    kind === "screen" ? loadJson(file.path, file.content) : loadYaml(file.path, file.content);
  if (!loaded.ok) return loaded;
  const versionIssue = kind === "project" ? checkVersion(file.path, loaded.data) : undefined;
  if (versionIssue) return { ok: false, issues: [versionIssue] };
  const id = rawId(loaded.data, idKey(kind));
  const aliased =
    kind === "table" || kind === "endpoint"
      ? applyZoneAlias(file.path, loaded.data, id)
      : { ok: true as const, data: loaded.data };
  if (!aliased.ok) return aliased;
  const result = parseWithSchema(schemaFor(kind, version), file.path, aliased.data, id);
  if (!result.ok) return result;
  const duplicates =
    kind === "roles" ? duplicateIdIssues(file.path, result.value as RolesFile) : [];
  return duplicates.length > 0
    ? { ok: false, issues: duplicates }
    : { ok: true, value: result.value, id };
}

function parseOne(file: SpecFile, kind: Kind, version: SpecVersion): FileResult {
  if (kind === "feature" || kind === "rule") {
    const parse = kind === "feature" ? parseFeatureMarkdown : parseRuleMarkdown;
    const result = parse(file.path, file.content);
    return result.ok ? { ok: true, value: result.value, id: result.value.id } : result;
  }
  return parseData(file, kind, version);
}

/** Fichier du dossier des tables hors format, ou `data/relations.yaml` en v2 : signalé, jamais ignoré. */
function unknownFileIssue(
  path: string,
  kind: Kind | undefined,
  version: SpecVersion,
): Issue | undefined {
  if (kind === undefined && isTableDirPath(path)) {
    const message = `Le fichier ${path} n'est pas au format attendu : un fichier de table se nomme data/tables/<slug>.yaml (identifiant T-<slug>).`;
    return structIssue("STRUCT_UNKNOWN_TABLE_FILE", path, message);
  }
  if (kind === "relations" && version === 2) {
    const message = `Le fichier ${path} n'existe plus en version 2 : les relations se déclarent dans chaque table (relations: [{vers, cardinalite}]).`;
    return structIssue("STRUCT_UNKNOWN_FILE", path, message);
  }
  return undefined;
}

const stem = (path: string) => path.replace(/\.[^./]*$/, "");
/** Ordre stable : chemin sans extension, puis chemin complet (S-register avant S-register-success). */
const byPath = (a: SpecFile, b: SpecFile) =>
  compare(stem(a.path), stem(b.path)) || compare(a.path, b.path);

const IDENTIFIED = new Set<Kind>([
  "feature",
  "table",
  "endpoint",
  "screen",
  "rule",
  "flow",
  "fixture",
]);

const empty = (): ParsedSpec => ({
  features: [],
  tables: [],
  relations: [],
  endpoints: [],
  screens: [],
  tests: [],
  roles: [],
  rules: [],
  flows: [],
  fixtures: [],
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
  else if (kind === "roles") spec.roles.push(entry as Parsed<RolesFile>);
  else if (kind === "rule") spec.rules.push(entry as Parsed<BusinessRule>);
  else if (kind === "flow") spec.flows.push(entry as Parsed<Flow>);
  else if (kind === "fixture") spec.fixtures.push(entry as Parsed<Fixture>);
  else spec.tests.push(entry);
}

/** Identifiant en désaccord avec le nom du fichier, ou déjà pris : l'entité est exclue. Sinon réserve l'identifiant. */
function identityIssue(
  path: string,
  kind: Kind,
  id: string,
  claimed: Map<string, string>,
): Issue | undefined {
  if (!idMatchesFile(path, id)) {
    const message = `L'identifiant ${id} ne correspond pas au nom du fichier ${path}.`;
    return structIssue("STRUCT_ID_MISMATCH", path, message, "/id", id);
  }
  const key = `${kind}:${id}`;
  const first = claimed.get(key);
  if (first !== undefined) {
    const message = `L'identifiant ${id} est déjà défini par ${first}.`;
    return structIssue("STRUCT_DUPLICATE_ID", path, message, "/id", id);
  }
  claimed.set(key, path);
  return undefined;
}

/**
 * Texte -> entités. Fichiers traités par chemin croissant ; une entité en échec est exclue de
 * `spec` et signalée ; le premier identifiant rencontré gagne, les doublons sont signalés.
 */
export function parseSpecFiles(files: readonly SpecFile[]): { spec: ParsedSpec; issues: Issue[] } {
  const spec = empty();
  const issues: Issue[] = [];
  const claimed = new Map<string, string>();
  const version = specVersionOf(files);
  const ordered = [...files].sort(byPath);
  for (const file of ordered) {
    const kind = kindOf(file.path);
    const unknown = unknownFileIssue(file.path, kind, version);
    if (unknown) issues.push(unknown);
    if (kind === undefined || (kind === "relations" && version === 2)) continue;
    const result = parseOne(file, kind, version);
    if (!result.ok) {
      issues.push(...result.issues);
      continue;
    }
    const id = IDENTIFIED.has(kind) ? result.id : undefined;
    const identity = id === undefined ? undefined : identityIssue(file.path, kind, id, claimed);
    if (identity) {
      issues.push(identity);
      continue;
    }
    place(spec, kind, file.path, result.value);
  }
  return { spec, issues: sortIssues(issues) };
}
