import type { DiagramNode, DiagramRelation } from "@koklo/ui";
import type { DiagramCard } from "./data-mermaid.ts";

/** Zone des tables qui n'en déclarent pas (ou au-delà des 100 noms lus). */
export const NO_ZONE = "Sans zone";
/** Schéma 1.3 de DESIGN.md §5.3 : au-delà de 25 tables réparties en au moins deux zones, le diagramme s'ouvre par zones. */
export const ZONE_VIEW_ABOVE = 25;
/** Carte de zone (maquette 11 l.475) : 300 × 180. */
export const ZONE_WIDTH = 300;
export const ZONE_HEIGHT = 180;

export interface DiagramZone {
  /** Libellé de la zone, tel qu'écrit dans les fichiers : il sert aussi de clé dans l'adresse (`?zone=`). */
  id: string;
  tableIds: string[];
  /** Noms des tables, dans l'ordre des identifiants (aperçu de la carte). */
  names: string[];
  /** Tables proposées encore à relire. */
  pending: number;
}

export interface ZoneNode extends DiagramNode {
  zone: DiagramZone;
}

export const zoneOfCard = (card: DiagramCard): string => card.zone ?? NO_ZONE;

/** Zones du modèle affiché (tables rejetées comprises : elles restent visibles, estompées), triées par libellé. */
export function zonesOf(cards: readonly DiagramCard[]): DiagramZone[] {
  const byZone = new Map<string, DiagramZone>();
  for (const card of [...cards].sort((a, b) => a.id.localeCompare(b.id, "en"))) {
    const id = zoneOfCard(card);
    const zone = byZone.get(id) ?? { id, tableIds: [], names: [], pending: 0 };
    zone.tableIds.push(card.id);
    zone.names.push(card.name);
    if (card.state === "review") zone.pending += 1;
    byZone.set(id, zone);
  }
  return [...byZone.values()].sort((a, b) => a.id.localeCompare(b.id, "fr"));
}

/** Le diagramme s'ouvre-t-il par zones ? Plus de 25 tables et au moins deux zones (B478). */
export const usesZoneView = (cards: readonly DiagramCard[], zones: readonly DiagramZone[]) =>
  cards.length > ZONE_VIEW_ABOVE && zones.length >= 2;

export const zoneNodeOf = (zone: DiagramZone): ZoneNode => ({
  id: zone.id,
  name: zone.id,
  width: ZONE_WIDTH,
  height: ZONE_HEIGHT,
  zone,
});

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/**
 * Traits entre zones (maquette 11 l.477) : une relation par paire de zones, étiquetée « 4 relations », d'autant plus
 * épaisse qu'elle en compte. Les relations internes à une zone ne sont pas tracées dans cette vue.
 */
export function zoneRelationsOf(
  relations: readonly DiagramRelation[],
  cards: readonly DiagramCard[],
): DiagramRelation[] {
  const zoneOf = new Map(cards.map((card) => [card.id, zoneOfCard(card)]));
  const counts = new Map<string, { from: string; to: string; count: number }>();
  for (const relation of relations) {
    const a = zoneOf.get(relation.from);
    const b = zoneOf.get(relation.to);
    if (a === undefined || b === undefined || a === b) continue;
    const [from, to] = a.localeCompare(b, "fr") < 0 ? [a, b] : [b, a];
    const key = `${from}\u0000${to}`;
    const entry = counts.get(key) ?? { from, to, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].map(({ from, to, count }) => ({
    id: `${from}>${to}`,
    from,
    to,
    label: plural(count, "relation", "relations"),
    labelFont: "sans" as const,
    weight: Math.min(6, 1 + count / 3),
  }));
}

/** Relations d'une zone vers les autres zones (« 17 liens vers d'autres zones », maquette 11 l.755). */
export function crossLinkCount(
  zone: string,
  relations: readonly DiagramRelation[],
  cards: readonly DiagramCard[],
): number {
  const zoneOf = new Map(cards.map((card) => [card.id, zoneOfCard(card)]));
  return relations.filter((relation) => {
    const a = zoneOf.get(relation.from);
    const b = zoneOf.get(relation.to);
    return a !== b && (a === zone || b === zone);
  }).length;
}

export const tablesLabel = (count: number) => plural(count, "table", "tables");
export const linksLabel = (count: number) =>
  plural(count, "lien vers d'autres zones", "liens vers d'autres zones");
