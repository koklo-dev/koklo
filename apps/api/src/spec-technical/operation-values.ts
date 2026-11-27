import type {
  NfrSummary,
  OperationDetail,
  OperationOptions,
  OperationSummary,
} from "@koklo/contract";
import { OPERATION_CALLERS_MAX } from "@koklo/contract";
import { emitOperationYaml, type Operation, TECHNICAL_PROPOSAL_VOCABULARY } from "@koklo/schema";
import { isRecord, list, text, texts } from "../spec-read/entity-values.ts";
import { englishOf, optional, record } from "./technical-values.ts";

/**
 * Lecture tolérante des opérations et des exigences indexées (`spec_entities.data`, TK-116), comme `technical-values` : les
 * valeurs françaises des fichiers deviennent le vocabulaire anglais du contrat.
 */
type Json = Record<string, unknown>;
type Side = "entree" | "sortie";
const RULE = /^R-\d{3,}$/;
const FEATURE = /^F-\d{3,}$/;
const PERMISSION = /^PM-./;

const matching = (value: unknown, pattern: RegExp): string[] =>
  texts(value).filter((id) => pattern.test(id));
const permissionOf = (value: unknown): string => (value === "interne" ? "internal" : text(value));

export function operationSummary(specId: string, path: string, data: unknown): OperationSummary {
  const json = record(data);
  return {
    specId,
    type: englishOf(TECHNICAL_PROPOSAL_VOCABULARY.operationType, json.type, "read"),
    zone: text(json.zone),
    component: text(json.composant),
    summary: text(json.resume),
    permission: permissionOf(json.permission),
    filePath: path,
  };
}

/** Champs d'entrée ou de sortie dans l'ordre du fichier (`champs`, posé par le worker : jsonb réordonne les clés). */
function fieldsOf(json: Json, side: Side): [string, Json][] {
  const fields = record(json[side]);
  const ordered = texts(record(json.champs)[side]).filter((name) => Object.hasOwn(fields, name));
  const names = [...new Set([...ordered, ...Object.keys(fields)])];
  return names.map((name) => [name, record(fields[name])]);
}

const errorsOf = (value: unknown): OperationDetail["errors"] =>
  list(value).map((entry) => {
    const error = record(entry);
    const rule = text(error.regle);
    return {
      code: text(error.code),
      when: text(error.quand),
      ...(RULE.test(rule) ? { rule } : {}),
    };
  });

/** Rôles du fichier qui ont la permission, quatre au plus, avec leur restriction (B778). */
function callersOf(roles: unknown, permission: string): OperationDetail["callers"] {
  if (!PERMISSION.test(permission)) return [];
  return list(record(roles).roles)
    .filter(isRecord)
    .filter((role) => texts(role.permissions).includes(permission))
    .slice(0, OPERATION_CALLERS_MAX)
    .map((role) => ({
      name: text(role.nom) || text(role.id),
      ...optional("restriction", record(role.restrictions)[permission]),
    }));
}

/** Fiche sans le SHA : `roles` est l'entité des rôles de la même tête. */
export function operationContent(
  row: { specId: string; path: string; data: unknown },
  roles: unknown,
): Omit<OperationDetail, "commitSha"> {
  const json = record(row.data);
  const summary = operationSummary(row.specId, row.path, json);
  return {
    ...summary,
    input: fieldsOf(json, "entree").map(([field, value]) => ({
      field,
      type: text(value.type),
      ...optional("constraint", value.contrainte),
    })),
    output: fieldsOf(json, "sortie").map(([field, value]) => ({
      field,
      type: text(value.type),
      ...optional("note", value.note),
    })),
    errors: errorsOf(json.erreurs),
    rules: matching(json.regles, RULE),
    features: matching(json.sert, FEATURE),
    ...optional("rateLimit", json.limite),
    callers: callersOf(roles, summary.permission),
  };
}

/** YAML d'une opération régénéré depuis l'index (sans les clés propres à l'index) ; données illisibles : texte vide. */
export function operationSource(data: unknown): string {
  const { titre: _title, champs: _order, ...entity } = record(data);
  const json = record(data);
  const ordered = (side: Side) => Object.fromEntries(fieldsOf(json, side));
  try {
    return emitOperationYaml({
      ...entity,
      entree: ordered("entree"),
      sortie: ordered("sortie"),
    } as unknown as Operation);
  } catch {
    return "";
  }
}

const sorted = (values: readonly string[]): string[] =>
  [...new Set(values.filter((value) => value !== ""))].sort((a, b) => a.localeCompare(b, "fr"));

/** Listes de la feuille « Opération » : zones des composants et des opérations, permissions du fichier des rôles. */
export function operationOptions(zoned: readonly unknown[], roles: unknown): OperationOptions {
  const file = record(roles);
  const declared = list(file.permissions).map((entry) => text(record(entry).id));
  const granted = list(file.roles).flatMap((entry) => texts(record(entry).permissions));
  return {
    zones: sorted(zoned.map((data) => text(record(data).zone))),
    permissions: sorted([...declared, ...granted].filter((id) => PERMISSION.test(id))),
  };
}

export function nfrSummary(specId: string, path: string, data: unknown): NfrSummary {
  const json = record(data);
  const verification = record(json.verification);
  const words = TECHNICAL_PROPOSAL_VOCABULARY;
  return {
    specId,
    category: englishOf(words.category, json.categorie, "operations"),
    title: text(json.titre) || specId,
    target: text(json.cible),
    statement: text(json.enonce),
    verification: englishOf(words.verification, verification.mode, "to_define"),
    ...optional("verificationDetail", verification.detail),
    links: texts(json.liens),
    filePath: path,
  };
}
