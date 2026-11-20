import type {
  DataFixtureSummary,
  DataSearch,
  DataTableSummary,
  TableDetail,
} from "@koklo/contract";
import { type Fixture, FixtureSchema, fixtureRowCount, generateFixturePage } from "@koklo/schema";
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
export const zoneOf = (data: unknown): string | undefined =>
  text(record(data).zone).slice(0, 80) || undefined;

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

export const fieldsOf = (data: unknown): Field[] =>
  list(record(data).champs).flatMap((entry) => fieldOf(entry) ?? []);

export function relationsOf(data: unknown): TableDetail["relations"] {
  return list(record(data).relations).flatMap((entry) => {
    const relation = record(entry);
    const to = text(relation.vers);
    const cardinality = CARDINALITIES.find((value) => value === relation.cardinalite);
    return TABLE.test(to) && cardinality !== undefined ? [{ to, cardinality }] : [];
  });
}

/** Nom d'une table : `nom`, sinon `titre` de l'index, sinon l'identifiant. */
export const tableName = (specId: string, data: unknown): string =>
  text(record(data).nom) || text(record(data).titre) || specId;

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

/** Résultat de la recherche d'une table : identifiant, nom et zone (tout ce que le client peut en voir). */
export function tableSearchItem(specId: string, data: unknown): DataSearch["items"][number] {
  const zone = zoneOf(data);
  return { id: specId, name: tableName(specId, data), ...(zone === undefined ? {} : { zone }) };
}

/** Valeurs de la fiche d'une table (panneau d'édition). */
export function tableDetail(
  specId: string,
  data: unknown,
  where: { filePath: string; commitSha: string },
): TableDetail {
  const json = record(data);
  const zone = zoneOf(json);
  const clientSummary = texts(json.resume_client);
  return {
    specId,
    name: text(json.nom) || text(json.titre) || specId,
    description: text(json.description),
    ...(zone === undefined ? {} : { zone }),
    ...(clientSummary.length === 0 ? {} : { clientSummary }),
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

/** Identité neutre : un jeu indexé sans `id`, `titre` ou `table` reste lisible (seules les lignes et `generation` comptent ici). */
const NEUTRAL_IDENTITY = { id: "FX-index", titre: "Jeu", table: "T-index", lignes: [] };

/** Jeu relu selon le schéma ; un contenu hors schéma (bloc `generation` illisible) retombe sur les lignes stockées. */
const fixtureOf = (data: unknown): Fixture | undefined => {
  const parsed = FixtureSchema.safeParse({ ...NEUTRAL_IDENTITY, ...record(data) });
  return parsed.success ? parsed.data : undefined;
};

/** Nombre de lignes d'un jeu : `generation.total` quand le bloc est lisible, sinon les lignes stockées. */
export const rowCountOf = (data: unknown): number => {
  const fixture = fixtureOf(data);
  return fixture === undefined ? rowsOf(data).length : fixtureRowCount(fixture);
};

/**
 * Une page d'un jeu (TK-110, B485) : lignes stockées d'abord, générées ensuite (accès direct, O(taille)). Colonnes : celles des
 * lignes stockées puis celles des règles, donc stables d'une page à l'autre. Mêmes lignes pour l'équipe et le client.
 */
export function fixturePage(
  data: unknown,
  page: number,
  size: number,
): { columns: string[]; items: Record<string, Cell>[]; total: number } {
  const fixture = fixtureOf(data);
  if (fixture === undefined) {
    const rows = rowsOf(data);
    const start = (page - 1) * size;
    return { columns: columnsOf(rows), items: rows.slice(start, start + size), total: rows.length };
  }
  return {
    columns: columnsOf([
      ...fixture.lignes,
      Object.fromEntries(Object.keys(fixture.generation?.regles ?? {}).map((key) => [key, ""])),
    ]),
    items: generateFixturePage(fixture, page, size),
    total: fixtureRowCount(fixture),
  };
}

export function fixtureSummary(specId: string, path: string, data: unknown): DataFixtureSummary {
  const json = record(data);
  return {
    specId,
    title: text(json.titre) || specId,
    table: text(json.table),
    locale: text(json.locale) || "fr-FR",
    rowCount: rowCountOf(data),
    filePath: path,
  };
}
