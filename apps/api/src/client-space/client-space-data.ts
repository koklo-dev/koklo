import type { ClientDataTable, ClientSpaceDataFixtures } from "@koklo/contract";
import { isRecord, list, text, texts } from "../spec-read/entity-values.ts";

/**
 * Tables et jeux d'exemple vus du client (TK-109, B450) : nom, type, clé et donnée personnelle des champs, relations nommées,
 * « utilisée par » en libellés, phrases `resume_client`. Contraintes, valeurs, règles par champ, sources brutes et chemins ne
 * sortent jamais. Lecture tolérante : une donnée absente ou d'un autre type reprend sa valeur neutre.
 */
type Json = Record<string, unknown>;
const SOURCE = /^(F-\d{3,}|R-\d{3,})$/;
const TABLE = /^T-[a-z0-9][a-z0-9-]*$/;
const CARDINALITIES = ["1 → 1", "1 → 0..1", "1 → n", "n → 1", "n ↔ n"] as const;
const record = (value: unknown): Json => (isRecord(value) ? value : {});

const fieldOf = (value: unknown): ClientDataTable["fields"] =>
  Object.keys(record(value)).length === 0 || text(record(value).nom) === ""
    ? []
    : [
        {
          name: text(record(value).nom),
          type: text(record(value).type),
          primaryKey: record(value).cle === "primaire",
          personalData: record(value).donnees_personnelles === true,
        },
      ];

const relationOf = (value: unknown, names: ReadonlyMap<string, string>) => {
  const relation = record(value);
  const to = text(relation.vers);
  const cardinality = CARDINALITIES.find((known) => known === relation.cardinalite);
  return TABLE.test(to) && cardinality !== undefined
    ? [{ to, toName: names.get(to) ?? to, cardinality }]
    : [];
};

export function clientTableOf(
  row: { specId: string; data: unknown },
  labels: ReadonlyMap<string, string>,
  names: ReadonlyMap<string, string>,
): ClientDataTable {
  const data = record(row.data);
  const zone = text(data.zone).slice(0, 80);
  return {
    id: row.specId,
    name: text(data.nom) || text(data.titre) || row.specId,
    ...(zone === "" ? {} : { zone }),
    description: text(data.description),
    fields: list(data.champs).flatMap(fieldOf),
    relations: list(data.relations).flatMap((relation) => relationOf(relation, names)),
    usedBy: texts(data.source)
      .filter((id) => SOURCE.test(id) && labels.has(id))
      .map((id) => ({ id, label: labels.get(id) as string })),
    clientSummary: texts(data.resume_client),
  };
}

export function clientFixtureOf(row: {
  specId: string;
  path: string;
  data: unknown;
}): ClientSpaceDataFixtures["items"][number] {
  const data = record(row.data);
  return {
    specId: row.specId,
    title: text(data.titre) || row.specId,
    table: text(data.table),
    locale: text(data.locale) || "fr-FR",
    rowCount: list(data.lignes).length,
  };
}
