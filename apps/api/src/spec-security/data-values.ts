import { createHash } from "node:crypto";
import type { SecurityContextOutput, SecurityDataRow } from "@koklo/contract";
import {
  type DataEntry,
  type EnvironmentsFile,
  isPersonalData,
  type ModelTable,
  SECURITY_PROPOSAL_VOCABULARY,
  type Stack,
  securityContext,
  unclassifiedFields,
} from "@koklo/schema";
import { countValues } from "../spec-technical/technical-values.ts";
import type { ListSource, Position } from "../tracker/long-list.ts";
import { dataOf, english, entriesOf, type IndexRow, rowsOfKind } from "./security-values.ts";

/**
 * Liste des données sensibles (B795, B808) : une ligne par entrée classée (identité : premier champ) et une par champ du
 * modèle sans entrée, triées par champ. Calculée en mémoire depuis l'index : aucune sous-requête. Fonctions pures.
 */
const VOCABULARY = SECURITY_PROPOSAL_VOCABULARY.dataCategory;

export const tablesOf = (rows: readonly IndexRow[]): ModelTable[] =>
  rowsOfKind(rows, "table").map((row) => {
    const data = row.data as Partial<ModelTable>;
    return { id: row.specId, champs: data.champs ?? [] };
  });

export function entryRow(entry: DataEntry): SecurityDataRow {
  const undecided = isPersonalData(entry.categorie) && entry.conservation === undefined;
  const field = entry.champs[0] as string;
  return {
    field,
    data: entry.donnee,
    fields: [...entry.champs],
    category: english(VOCABULARY, entry.categorie),
    ...(entry.conservation === undefined ? {} : { retention: entry.conservation }),
    ...(entry.conservation_proposee === undefined
      ? {}
      : { retentionSuggestion: entry.conservation_proposee }),
    access: [...(entry.acces ?? [])],
    ...(entry.protection === undefined ? {} : { protection: entry.protection }),
    status: undecided ? "undecided" : "classified",
  };
}

const unclassifiedRow = (field: string): SecurityDataRow => ({
  field,
  fields: [field],
  access: [],
  status: "unclassified",
});

const byField = (a: SecurityDataRow, b: SecurityDataRow) =>
  a.field < b.field ? -1 : a.field > b.field ? 1 : 0;

export function dataRows(rows: readonly IndexRow[]): SecurityDataRow[] {
  const entries = entriesOf(rows);
  const missing = unclassifiedFields({ donnees: entries }, tablesOf(rows));
  return [...entries.map(entryRow), ...missing.map(unclassifiedRow)].sort(byField);
}

export function dataFacets(rows: readonly SecurityDataRow[]) {
  const statuses = countValues(rows.map((row) => row.status));
  return {
    status: {
      total: rows.length,
      /** Entrées enregistrées, décidées ou non (B813 : « K données classées »). */
      classified: (statuses.classified ?? 0) + (statuses.undecided ?? 0),
      unclassified: statuses.unclassified ?? 0,
      undecided: statuses.undecided ?? 0,
    },
    category: countValues(rows.flatMap((row) => row.category ?? [])),
  };
}

const folded = (text: string): string => text.toLocaleLowerCase("fr");
const matches = (row: SecurityDataRow, query: string): boolean =>
  [row.data, ...row.fields, ...row.access, row.protection, row.retention].some((value) =>
    folded(value ?? "").includes(query),
  );

export function filteredRows(
  rows: readonly SecurityDataRow[],
  filter: {
    q?: string | undefined;
    category?: string | undefined;
    undecided?: boolean | undefined;
  },
): SecurityDataRow[] {
  const query = filter.q === undefined ? undefined : folded(filter.q.trim());
  return rows.filter(
    (row) =>
      (filter.category === undefined || row.category === filter.category) &&
      (filter.undecided !== true || row.status !== "classified") &&
      (query === undefined || matches(row, query)),
  );
}

/** Identifiant stable d'une ligne (forme d'UUID), pour le curseur des listes longues. */
const rowId = (field: string): string => {
  const hex = createHash("sha256").update(field).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};
const positionOf = (row: SecurityDataRow): Position<string> => ({
  key: row.field,
  id: rowId(row.field),
});

/** `ListSource` d'un tableau déjà trié par champ ; `all` : la liste sans filtre, pour `around`. */
export function dataSource(
  listed: readonly SecurityDataRow[],
  all: readonly SecurityDataRow[],
): ListSource<SecurityDataRow, string> {
  const countBefore = (position: Position<string>) =>
    listed.filter((row) => row.field < position.key).length;
  return {
    total: async () => listed.length,
    page: async (direction, from, take, skip) => {
      const ordered =
        direction === "after"
          ? listed.filter((row) => from === null || row.field > from.key)
          : listed.filter((row) => from === null || row.field < from.key).reverse();
      return ordered.slice(skip, skip + take);
    },
    countBefore: async (position) => countBefore(position),
    locate: async (field) => {
      const row = all.find((entry) => entry.field === field);
      if (!row) return null;
      return { position: positionOf(row), listed: listed.includes(row) };
    },
    positionOf,
    encodeKey: (key) => key,
    decodeKey: (raw) => (typeof raw === "string" ? raw : null),
  };
}

/** Hébergement et sous-traitants du cahier technique, transferts de `security/data.yaml` ; absent : « à préciser ». */
export function contextView(rows: readonly IndexRow[]): SecurityContextOutput {
  const transfers = rowsOfKind(rows, "sensitive")
    .map((row) => (row.data as { transferts?: string }).transferts)
    .find((value) => value !== undefined);
  const context = securityContext({
    environments: dataOf<EnvironmentsFile>(rows, "environments"),
    stacks: rowsOfKind(rows, "stack").map((row) => row.data as Stack),
    data: { transferts: transfers },
  });
  return {
    hosting: [...context.hosting],
    subprocessors: [...context.subprocessors],
    transfers: context.transfers ?? null,
  };
}
