import type { DataFixtureSummary, DataTableSummary, TableDetail } from "@koklo/contract";
import { isRecord, list, text, texts } from "../spec-read/entity-values.ts";

/**
 * Lecture tolérante des tables et des jeux d'exemple de l'index d'entités (`spec_entities.data`, TK-107) : ce que le worker
 * écrit depuis `data/tables/<slug>.yaml` et `data/fixtures/FX-<slug>.yaml`. Rien n'est supposé : un champ absent ou d'un autre
 * type reprend sa valeur neutre, jamais une exception.
 */
type Json = Record<string, unknown>;
type Cell = string | number | boolean;

const SOURCE = /^(F-\d{3,}|R-\d{3,})$/;
const RULE = /^R-\d{3,}$/;
const TABLE = /^T-[a-z0-9][a-z0-9-]*$/;
const CARDINALITIES = ["1 → 1", "1 → 0..1", "1 → n", "n → 1", "n ↔ n"] as const;

const record = (value: unknown): Json => (isRecord(value) ? value : {});
const sourcesOf = (data: Json): string[] => texts(data.source).filter((id) => SOURCE.test(id));
const zoneOf = (data: Json): string | undefined => text(data.zone).slice(0, 80) || undefined;

type Field = TableDetail["fields"][number];

function fieldOf(value: unknown): Field | undefined {
  const field = record(value);
  const name = text(field.nom);
  if (name === "") return undefined;
  const values = texts(field.valeurs);
  const rule = text(field.regle);
  return {
    name,
    type: text(field.type),
    primaryKey: field.cle === "primaire",
    ...(text(field.contraintes) === "" ? {} : { constraints: text(field.contraintes) }),
    ...(values.length === 0 ? {} : { values }),
    ...(RULE.test(rule) ? { rule } : {}),
    personalData: field.donnees_personnelles === true,
  };
}

const fieldsOf = (data: Json): Field[] =>
  list(data.champs).flatMap((entry) => fieldOf(entry) ?? []);

function relationsOf(data: Json): TableDetail["relations"] {
  return list(data.relations).flatMap((entry) => {
    const relation = record(entry);
    const to = text(relation.vers);
    const cardinality = CARDINALITIES.find((value) => value === relation.cardinalite);
    return TABLE.test(to) && cardinality !== undefined ? [{ to, cardinality }] : [];
  });
}

/** Ligne du tableau Tables : `relationCount` compte les relations déclarées et celles qui visent la table (B384). */
export function tableSummary(
  specId: string,
  path: string,
  data: unknown,
  relationCount: number,
): DataTableSummary {
  const json = record(data);
  const fields = fieldsOf(json);
  const zone = zoneOf(json);
  return {
    specId,
    name: text(json.nom) || text(json.titre) || specId,
    ...(zone === undefined ? {} : { zone }),
    fieldCount: fields.length,
    relationCount,
    usedBy: sourcesOf(json),
    personalData: fields.some((field) => field.personalData),
    filePath: path,
  };
}

/** Valeurs de la fiche d'une table (panneau d'édition). */
export function tableDetail(
  specId: string,
  data: unknown,
  where: { filePath: string; commitSha: string },
): TableDetail {
  const json = record(data);
  const zone = zoneOf(json);
  return {
    specId,
    name: text(json.nom) || text(json.titre) || specId,
    description: text(json.description),
    ...(zone === undefined ? {} : { zone }),
    sources: sourcesOf(json),
    fields: fieldsOf(json),
    relations: relationsOf(json),
    ...where,
  };
}

const cellOf = (value: unknown): Cell | undefined =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : undefined;

/** Lignes d'un jeu : objets à valeurs scalaires ; une valeur d'un autre type est écartée. */
export function rowsOf(data: unknown): Record<string, Cell>[] {
  return list(record(data).lignes).map((row) =>
    Object.fromEntries(
      Object.entries(record(row)).flatMap(([key, value]) => {
        const cell = cellOf(value);
        return cell === undefined ? [] : [[key, cell] as const];
      }),
    ),
  );
}

/** Colonnes d'un jeu : les clés des lignes, dans l'ordre de première apparition. */
export function columnsOf(rows: readonly Record<string, Cell>[]): string[] {
  const columns = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) columns.add(key);
  return [...columns];
}

export function fixtureSummary(specId: string, path: string, data: unknown): DataFixtureSummary {
  const json = record(data);
  return {
    specId,
    title: text(json.titre) || specId,
    table: text(json.table),
    locale: text(json.locale) || "fr-FR",
    rowCount: list(json.lignes).length,
    filePath: path,
  };
}
