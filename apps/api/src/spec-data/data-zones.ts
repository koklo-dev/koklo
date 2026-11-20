import { ZONE_PREVIEW_MAX, ZONE_TABLES_MAX } from "@koklo/contract";
import {
  type TableRelation,
  tableRelations,
  ZONE_ICON_DEFAULT,
  type ZoneStyle,
} from "@koklo/schema";
import { fieldsOf, relationsOf, tableName, zoneOf } from "./data-values.ts";

/**
 * Zones du modèle de données (TK-110, B483, B484) : calcul pur sur les tables indexées de la tête. Une zone est la valeur
 * `zone` des tables (libellé libre) ; les tables sans zone forment « Sans zone ». Les zones suivent l'ordre d'apparition des
 * tables ; un lien entre deux zones compte les paires de tables reliées (relations déclarées et clés étrangères, comme le
 * diagramme), une fois par paire quel que soit le sens.
 */
export const NO_ZONE_NAME = "Sans zone";
export const NO_ZONE_ID = "sans-zone";
const ZONE_ID_MAX = 80;

/**
 * Table de l'index vue pour le calcul des zones : lecture tolérante (une donnée absente reprend sa valeur neutre, jamais
 * d'exception), les relations sont celles du diagramme (`tableRelations`). `data` reste la valeur brute de l'index.
 */
export interface ZoneTable {
  id: string;
  name: string;
  zone: string | undefined;
  relations: TableRelation[];
  data: unknown;
}

export const zoneTables = (rows: readonly { specId: string; data: unknown }[]): ZoneTable[] =>
  rows.map(({ specId, data }) => ({
    id: specId,
    name: tableName(specId, data),
    zone: zoneOf(data),
    relations: tableRelations({
      id: specId,
      champs: fieldsOf(data),
      relations: relationsOf(data).map(({ to, cardinality }) => ({
        vers: to,
        cardinalite: cardinality,
      })),
    }),
    data,
  }));

/** Identifiant d'une zone : libellé sans accents, en minuscules, séparé par des tirets. */
export function zoneIdOf(name: string | undefined): string {
  if (name === undefined) return NO_ZONE_ID;
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, ZONE_ID_MAX)
    .replace(/-+$/, "");
  return slug === "" ? "zone" : slug;
}

export interface ZoneSummary {
  id: string;
  name: string;
  icon: string;
  tableCount: number;
}
export interface ZoneEntry extends ZoneSummary {
  preview: string[];
  links: { to: string; count: number }[];
}

interface Group {
  id: string;
  name: string;
  members: ZoneTable[];
}

/** Zones dans l'ordre d'apparition des tables, « Sans zone » en dernier. */
function groupsOf(tables: readonly ZoneTable[]): Group[] {
  const groups = new Map<string, Group>();
  for (const table of tables) {
    const name = table.zone;
    const id = zoneIdOf(name);
    const group = groups.get(id) ?? { id, name: name ?? NO_ZONE_NAME, members: [] };
    group.members.push(table);
    groups.set(id, group);
  }
  const ordered = [...groups.values()];
  return [
    ...ordered.filter((g) => g.id !== NO_ZONE_ID),
    ...ordered.filter((g) => g.id === NO_ZONE_ID),
  ];
}

const summaryOf = (group: Group, styles: readonly ZoneStyle[]): ZoneSummary => ({
  id: group.id,
  name: group.name,
  icon: styles.find((style) => zoneIdOf(style.nom) === group.id)?.icone ?? ZONE_ICON_DEFAULT,
  tableCount: group.members.length,
});

/** Paires de tables reliées entre zones différentes, comptées par paire de zones (sans sens, sans doublon). */
function crossLinks(tables: readonly ZoneTable[]): Map<string, Map<string, number>> {
  const zoneIds = new Map(tables.map((table) => [table.id, zoneIdOf(table.zone)]));
  const seen = new Set<string>();
  const links = new Map<string, Map<string, number>>();
  const bump = (from: string, to: string) => {
    const row = links.get(from) ?? new Map<string, number>();
    row.set(to, (row.get(to) ?? 0) + 1);
    links.set(from, row);
  };
  for (const table of tables) {
    for (const { vers } of table.relations) {
      const from = zoneIds.get(table.id);
      const to = zoneIds.get(vers);
      const pair = [table.id, vers].sort().join("|");
      if (from === undefined || to === undefined || from === to || seen.has(pair)) continue;
      seen.add(pair);
      bump(from, to);
      bump(to, from);
    }
  }
  return links;
}

/** Liens d'une zone vers les autres : plus nombreux d'abord, puis dans l'ordre des zones. */
function linksOf(
  id: string,
  links: ReadonlyMap<string, ReadonlyMap<string, number>>,
  order: readonly string[],
): { to: string; count: number }[] {
  return [...(links.get(id) ?? [])]
    .map(([to, count]) => ({ to, count }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.to) - order.indexOf(b.to));
}

export function buildZones(
  tables: readonly ZoneTable[],
  styles: readonly ZoneStyle[],
): { zones: ZoneEntry[]; tableCount: number } {
  const groups = groupsOf(tables);
  const links = crossLinks(tables);
  const order = groups.map((group) => group.id);
  return {
    tableCount: tables.length,
    zones: groups.map((group) => ({
      ...summaryOf(group, styles),
      preview: group.members.slice(0, ZONE_PREVIEW_MAX).map((table) => table.name),
      links: linksOf(group.id, links, order),
    })),
  };
}

export interface ZoneView {
  zone: ZoneSummary;
  /** Tables rendues, 200 au plus. */
  members: ZoneTable[];
  /** Relations entre les tables rendues. */
  relations: { from: string; to: string; cardinality: TableRelation["cardinalite"] }[];
  outgoing: { zone: string; count: number }[];
  truncated: boolean;
}

/** Une zone ouverte ; `undefined` : identifiant inconnu. */
export function buildZone(
  tables: readonly ZoneTable[],
  styles: readonly ZoneStyle[],
  id: string,
): ZoneView | undefined {
  const groups = groupsOf(tables);
  const group = groups.find((entry) => entry.id === id);
  if (group === undefined) return undefined;
  const members = group.members.slice(0, ZONE_TABLES_MAX);
  const shown = new Set(members.map((member) => member.id));
  const links = linksOf(
    id,
    crossLinks(tables),
    groups.map((entry) => entry.id),
  );
  return {
    zone: summaryOf(group, styles),
    members,
    relations: members.flatMap((member) =>
      member.relations
        .filter(({ vers }) => shown.has(vers))
        .map(({ vers, cardinalite }) => ({ from: member.id, to: vers, cardinality: cardinalite })),
    ),
    outgoing: links.map(({ to, count }) => ({ zone: to, count })),
    truncated: group.members.length > members.length,
  };
}
