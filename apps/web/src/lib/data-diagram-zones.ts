import type { DiagramNode, DiagramPoint, DiagramRelation, ErTableField } from "@koklo/ui";
import type { DiagramCard } from "./data-mermaid.ts";

/** Zone des tables qui n'en déclarent pas. */
export const NO_ZONE = "Sans zone";
/** Schéma 1.3 de DESIGN.md §5.3 : au-delà de 25 tables réparties en au moins deux zones, le diagramme s'ouvre par zones. */
export const ZONE_VIEW_ABOVE = 25;
/** Carte de zone (maquette 11 l.475) : 300 × 180. */
export const ZONE_WIDTH = 300;
export const ZONE_HEIGHT = 180;

/** Une zone telle que le serveur la décrit (`spec.data.zones`, `clientSpace.dataZones`). */
export interface ZoneEntry {
  id: string;
  name: string;
  icon: string;
  tableCount: number;
  /** Noms des 7 premières tables. */
  preview: readonly string[];
  links: ReadonlyArray<{ to: string; count: number }>;
}

export interface DiagramZone {
  /** Identifiant serveur (`data.zone` le prend) ; le libellé d'une zone proposée absente de l'index pour les autres. */
  id: string;
  /** Libellé, tel qu'écrit dans les fichiers : il sert de clé dans l'adresse (`?zone=`). */
  name: string;
  icon: string;
  tableCount: number;
  preview: readonly string[];
  /** Tables proposées encore à relire (vue de relecture). */
  pending: number;
  /** Faux : zone qui n'existe que dans les propositions, rien à lire du serveur. */
  saved: boolean;
}

export interface ZoneNode extends DiagramNode {
  zone: DiagramZone;
}

export const zoneOfCard = (card: DiagramCard): string => card.zone ?? NO_ZONE;

const fr = (a: string, b: string) => a.localeCompare(b, "fr");

/**
 * Cartes de la vue des zones : celles du serveur, triées par libellé, avec le nombre de tables proposées à relire ;
 * une zone proposée absente de l'index est ajoutée (carte sans aperçu enregistré).
 */
export function zoneNodesOf(
  entries: readonly ZoneEntry[],
  proposed: readonly DiagramCard[],
): ZoneNode[] {
  const pending = new Map<string, number>();
  const added = new Map<string, string[]>();
  const known = new Set(entries.map((entry) => entry.name));
  for (const card of proposed) {
    if (card.state === "rejected") continue;
    const name = card.zone ?? NO_ZONE;
    if (card.state === "review") pending.set(name, (pending.get(name) ?? 0) + 1);
    if (!known.has(name)) added.set(name, [...(added.get(name) ?? []), card.name]);
  }
  const zones: DiagramZone[] = [
    ...entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      icon: entry.icon,
      tableCount: entry.tableCount,
      preview: entry.preview,
      pending: pending.get(entry.name) ?? 0,
      saved: true,
    })),
    ...[...added].map(([name, names]) => ({
      id: name,
      name,
      icon: "folder_open",
      tableCount: names.length,
      preview: names,
      pending: pending.get(name) ?? 0,
      saved: false,
    })),
  ];
  return zones.sort((a, b) => fr(a.name, b.name)).map(zoneNodeOf);
}

/** Le diagramme s'ouvre-t-il par zones ? Plus de 25 tables et au moins deux zones (B478). */
export const usesZoneView = (tables: number, zones: number) =>
  tables > ZONE_VIEW_ABOVE && zones >= 2;

/** Grille à 2 colonnes de la vue des zones (maquette 11 l.476) : x = 40 + (i % 2) × 400, y = 30 + ⌊i / 2⌋ × 270. */
export const zoneGridPositions = (nodes: readonly DiagramNode[]): Record<string, DiagramPoint> =>
  Object.fromEntries(
    nodes.map((node, index) => [
      node.id,
      { x: 40 + (index % 2) * 400, y: 30 + Math.floor(index / 2) * 270 },
    ]),
  );

export const zoneNodeOf = (zone: DiagramZone): ZoneNode => ({
  id: zone.id,
  name: zone.name,
  width: ZONE_WIDTH,
  height: ZONE_HEIGHT,
  zone,
});

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/**
 * Traits entre zones (maquette 11 l.477) : un par paire de zones, étiqueté « 4 relations », d'autant plus épais qu'elle
 * en compte. Le serveur donne les liens des deux côtés ; la paire n'est tracée qu'une fois.
 */
export function zoneRelationsOf(entries: readonly ZoneEntry[]): DiagramRelation[] {
  const ids = new Set(entries.map((entry) => entry.id));
  const seen = new Set<string>();
  const relations: DiagramRelation[] = [];
  for (const entry of entries) {
    for (const { to, count } of entry.links) {
      if (!ids.has(to)) continue;
      const [from, other] = entry.id < to ? [entry.id, to] : [to, entry.id];
      const id = `${from}>${other}`;
      if (seen.has(id)) continue;
      seen.add(id);
      relations.push({
        id,
        from,
        to: other,
        label: plural(count, "relation", "relations"),
        labelFont: "sans" as const,
        weight: Math.min(6, 1 + count / 3),
      });
    }
  }
  return relations;
}

/** Relations d'une zone vers les autres zones (« 17 liens vers d'autres zones », maquette 11 l.755). */
export const crossLinkCount = (outgoing: ReadonlyArray<{ zone?: string; count: number }>): number =>
  outgoing.reduce((total, link) => total + link.count, 0);

export const tablesLabel = (count: number) => plural(count, "table", "tables");
export const linksLabel = (count: number) =>
  plural(count, "lien vers d'autres zones", "liens vers d'autres zones");

/** Carte d'une zone voisine dans une zone ouverte (B480) : 260 × 96, nom et compte, un clic y passe. */
export const NEIGHBOR_WIDTH = 260;
export const NEIGHBOR_HEIGHT = 96;
const NEIGHBOR_PREFIX = "zone:";

export interface NeighborNode extends DiagramNode {
  neighbor: { zone: string; tables: number; links: number };
}

export const isNeighborId = (id: string) => id.startsWith(NEIGHBOR_PREFIX);
export const neighborZoneOf = (id: string) => id.slice(NEIGHBOR_PREFIX.length);

/**
 * Zones voisines d'une zone ouverte (B480) : une carte par zone liée, avec ses tables et le nombre de relations ; un
 * clic y passe, sans perdre le détail des tables. Le serveur ne donne que le compte par zone : pas de trait par table.
 */
export function neighborsOf(
  outgoing: ReadonlyArray<{ zone: string; count: number }>,
  entries: readonly ZoneEntry[],
): NeighborNode[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return outgoing
    .flatMap(({ zone, count }) => {
      const entry = byId.get(zone);
      return entry ? [{ entry, count }] : [];
    })
    .sort((a, b) => fr(a.entry.name, b.entry.name))
    .map(({ entry, count }) => ({
      id: `${NEIGHBOR_PREFIX}${entry.name}`,
      name: entry.name,
      width: NEIGHBOR_WIDTH,
      height: NEIGHBOR_HEIGHT,
      neighbor: { zone: entry.name, tables: entry.tableCount, links: count },
    }));
}

/** Tables d'une zone ouverte (`spec.data.zone`) en cartes du diagramme, puis les tables proposées de la zone. */
export function zoneCardsOf(
  data: { tables: ReadonlyArray<ZoneTableLike> } | undefined,
  proposed: readonly DiagramCard[],
): DiagramCard[] {
  const saved = (data?.tables ?? []).map((table) => ({
    id: table.specId,
    name: table.name,
    fields: table.fields.map<ErTableField>((field) => ({
      name: field.name,
      type: field.type,
      kind: field.primaryKey ? "primary" : "plain",
    })),
    ...(table.zone ? { zone: table.zone } : {}),
  }));
  const known = new Set(saved.map((card) => card.id));
  return [...saved, ...proposed.filter((card) => !known.has(card.id))];
}

/** Ce que la carte lit d'une table de zone (équipe : `specId`, client : même forme après conversion). */
export interface ZoneTableLike {
  specId: string;
  name: string;
  zone?: string | undefined;
  personalData?: boolean;
  fields: ReadonlyArray<{
    name: string;
    type: string;
    primaryKey: boolean;
    personalData?: boolean;
  }>;
}

/**
 * Positions enregistrées appliquées à une vue (B481) : seulement si chaque table affichée en a une ; sinon le
 * placement automatique, pour ne jamais mélanger des coins enregistrés dans une autre vue avec le placement calculé.
 */
export function positionsForView(
  saved: Readonly<Record<string, DiagramPoint>>,
  tableIds: readonly string[],
): Readonly<Record<string, DiagramPoint>> {
  return tableIds.length > 0 && tableIds.every((id) => saved[id] !== undefined) ? saved : {};
}
