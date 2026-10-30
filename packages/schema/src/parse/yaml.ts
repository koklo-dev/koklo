import { type Document, isAlias, isNode, parseDocument, visit, type YAMLError } from "yaml";
import { structIssue } from "../issue.ts";
import type { Issue } from "../types.ts";

export const MAX_FILE_CHARS = 1_048_576;

export type Loaded = { ok: true; data: unknown } | { ok: false; issues: Issue[] };

const fail = (issue: Issue): Loaded => ({ ok: false, issues: [issue] });

export function tooLarge(path: string, content: string): Issue | undefined {
  if (content.length <= MAX_FILE_CHARS) return undefined;
  return structIssue(
    "STRUCT_FILE_TOO_LARGE",
    path,
    `Le fichier dépasse le plafond de ${MAX_FILE_CHARS} caractères.`,
  );
}

function position(error: YAMLError): string {
  const [start] = error.linePos ?? [];
  return start ? `ligne ${start.line}, colonne ${start.col}` : "position inconnue";
}

function fromError(path: string, content: string, error: YAMLError): Issue {
  const where = position(error);
  const first = error.message.split("\n")[0] ?? "";
  if (error.code === "DUPLICATE_KEY") {
    const key = (/^[^:,}\n]*/.exec(content.slice(error.pos[0]))?.[0] ?? "").trim();
    return structIssue("STRUCT_DUPLICATE_KEY", path, `Clé dupliquée « ${key} » (${where}).`);
  }
  if (error.code === "MULTIPLE_DOCS") {
    return structIssue(
      "STRUCT_MULTIPLE_DOCUMENTS",
      path,
      `Un seul document YAML est accepté (${where}).`,
    );
  }
  return structIssue("STRUCT_YAML_SYNTAX", path, `YAML invalide (${where}) : ${first}`);
}

/** Premier alias, ancre ou étiquette explicite rencontré, s'il y en a un. */
function forbiddenFeature(doc: Document.Parsed): string | undefined {
  let found: string | undefined;
  visit(doc, (_key, node) => {
    if (isAlias(node)) found = "alias";
    else if (isNode(node) && node.anchor) found = `ancre &${node.anchor}`;
    else if (isNode(node) && node.tag) found = `étiquette ${node.tag}`;
    return found === undefined ? undefined : visit.BREAK;
  });
  return found;
}

/**
 * Lecture YAML durcie : YAML 1.2 schéma core, clé dupliquée refusée, aucun alias,
 * ancre ni étiquette, pas de fusion `<<`, un seul document, taille plafonnée.
 */
export function loadYaml(path: string, content: string): Loaded {
  const big = tooLarge(path, content);
  if (big) return fail(big);
  const doc = parseDocument(content, {
    version: "1.2",
    schema: "core",
    uniqueKeys: true,
    merge: false,
    prettyErrors: true,
    strict: true,
  });
  const [error] = doc.errors;
  if (error) return fail(fromError(path, content, error));
  const feature = forbiddenFeature(doc);
  if (feature) {
    const message = `Fonctionnalité YAML interdite dans la spec : ${feature}.`;
    return fail(structIssue("STRUCT_YAML_FORBIDDEN_FEATURE", path, message));
  }
  return { ok: true, data: doc.toJS({ maxAliasCount: 0 }) };
}

/** Lecture JSON : jamais d'exception. */
export function loadJson(path: string, content: string): Loaded {
  const big = tooLarge(path, content);
  if (big) return fail(big);
  try {
    return { ok: true, data: JSON.parse(content) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "erreur inconnue";
    return fail(structIssue("STRUCT_JSON_SYNTAX", path, `JSON invalide : ${reason}`));
  }
}
