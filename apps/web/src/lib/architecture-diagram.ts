import {
  ARCH_NODE_LABELS,
  type ArchNodeKind,
  archNodeSize,
  type DiagramBand,
  type DiagramNode,
  type DiagramPoint,
  type DiagramRelation,
  type IconName,
} from "@koklo/ui";

/**
 * Schéma d'architecture (TK-112, B547, maquette 13 l.576-583, 672-710) : couches, nœuds, liens et cartes de zone, en
 * fonctions pures. Les positions viennent d'ici (couche fixée, ordre des identifiants) ; celles enregistrées dans
 * `architecture/_layout.yaml` passent par-dessus nœud par nœud.
 */

/** Zone d'un composant : même règle que le diagramme des Données (plus de 25 composants en au moins deux zones). */
export const ZONE_VIEW_ABOVE = 25;
export const usesZoneView = (components: number, zones: number): boolean =>
  components > ZONE_VIEW_ABOVE && zones >= 2;

/** Carte de zone (maquette 13 l.702-710) : 300 × 180 ; grille à 2 colonnes, x = 40 + (i % 2) × 400, y = 30 + ⌊i / 2⌋ × 270. */
export const ZONE_WIDTH = 300;
export const ZONE_HEIGHT = 180;
/** Noms d'aperçu d'une carte de zone avant « +N » (maquette 13 l.704). */
export const ZONE_PREVIEW = 5;

/** Une zone telle que `spec.architecture.zones` la décrit. */
export interface ArchZoneEntry {
  id: string;
  name: string;
  icon: string;
  componentCount: number;
  actorCount: number;
  preview: readonly string[];
  links: ReadonlyArray<{ to: string; count: number }>;
}

export interface ArchZoneNode extends DiagramNode {
  zone: ArchZoneEntry;
}

const fr = (a: string, b: string) => a.localeCompare(b, "fr");

export const zoneNodesOf = (entries: readonly ArchZoneEntry[]): ArchZoneNode[] =>
  [...entries]
    .sort((a, b) => fr(a.name, b.name))
    .map((zone) => ({
      id: zone.id,
      name: zone.name,
      width: ZONE_WIDTH,
      height: ZONE_HEIGHT,
      zone,
    }));

export const zoneGridPositions = (nodes: readonly DiagramNode[]): Record<string, DiagramPoint> =>
  Object.fromEntries(
    nodes.map((node, index) => [
      node.id,
      { x: 40 + (index % 2) * 400, y: 30 + Math.floor(index / 2) * 270 },
    ]),
  );

const plural = (count: number, one: string, other: string) => `${count} ${count > 1 ? other : one}`;
export const componentsLabel = (count: number) => plural(count, "composant", "composants");
export const actorsLabel = (count: number) => plural(count, "acteur", "acteurs");
export const linksLabel = (count: number) => plural(count, "lien", "liens");

/** Trait entre deux zones : un par paire, étiqueté « 4 liens », d'autant plus épais qu'elle en compte (maquette 13 l.702). */
export function zoneRelationsOf(entries: readonly ArchZoneEntry[]): DiagramRelation[] {
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
        label: linksLabel(count),
        labelFont: "sans",
        weight: Math.min(6, 1 + count / 3),
      });
    }
  }
  return relations;
}

/** Couches (maquette 13 l.581) : haut et hauteur dans le repère du plan. */
const LANES: ReadonlyArray<{ id: string; label: string; top: number; height: number }> = [
  { id: "actors", label: "Utilisateurs", top: 0, height: 140 },
  { id: "apps", label: "Applications", top: 140, height: 180 },
  { id: "services", label: "Services", top: 320, height: 220 },
  { id: "data", label: "Données et services externes", top: 540, height: 250 },
];
const LANE_OF: Record<ArchNodeKind, number> = {
  actor: 0,
  app: 1,
  service: 2,
  store: 3,
  queue: 3,
  ext: 3,
};
const LANE_LEFT = 30;
const GAP = 24;

/** Nœud du schéma : composant (`C-`), acteur (`RL-`) ou composant d'une autre zone (`zone:<libellé>`). */
export interface ArchNode extends DiagramNode {
  kind: ArchNodeKind;
  subtitle?: string;
  /** Libellé de la zone que ce nœud estompé ouvre. */
  ghostZone?: string;
}

/** Ce que `spec.architecture.zone` rend d'une zone. */
export interface ArchZoneDetail {
  zone: { id: string; name: string };
  components: ReadonlyArray<{ specId: string; name: string; type: ArchNodeKind }>;
  relations: ReadonlyArray<{ from: string; to: string; via: string; async?: boolean | undefined }>;
  actors: ReadonlyArray<{ id: string; name: string }>;
  outgoing: ReadonlyArray<{ zone: string; count: number }>;
}

const GHOST_PREFIX = "zone:";
export const isGhostId = (id: string): boolean => id.startsWith(GHOST_PREFIX);
export const ghostZoneOf = (id: string): string => id.slice(GHOST_PREFIX.length);

const nodeOf = (id: string, name: string, kind: ArchNodeKind): ArchNode => ({
  id,
  name,
  kind,
  ...archNodeSize(kind),
});

/** Nœuds d'un ou plusieurs détails de zone : composants, acteurs (une fois), puis les zones voisines si on les veut. */
export function nodesOf(
  details: readonly ArchZoneDetail[],
  ghosts: ReadonlyArray<{ id: string; name: string }> = [],
): ArchNode[] {
  const byId = new Map<string, ArchNode>();
  for (const detail of details) {
    for (const component of detail.components) {
      byId.set(component.specId, nodeOf(component.specId, component.name, component.type));
    }
    for (const actor of detail.actors) byId.set(actor.id, nodeOf(actor.id, actor.name, "actor"));
  }
  const ghostNodes = ghosts.map(
    (ghost): ArchNode => ({
      ...nodeOf(`${GHOST_PREFIX}${ghost.name}`, ghost.name, "service"),
      width: 240,
      subtitle: "Hors zone",
      ghostZone: ghost.name,
    }),
  );
  return [...byId.values(), ...ghostNodes];
}

/** Zones voisines d'une zone ouverte : celles où mènent ses liens sortants (une carte par zone). */
export function ghostsOf(
  detail: ArchZoneDetail,
  entries: readonly ArchZoneEntry[],
): Array<{ id: string; name: string }> {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return detail.outgoing
    .flatMap(({ zone }) => {
      const entry = byId.get(zone);
      return entry ? [{ id: entry.id, name: entry.name }] : [];
    })
    .sort((a, b) => fr(a.name, b.name));
}

/** Liens entre composants rendus : « moyen », pointillés quand l'appel est asynchrone (maquette 13 l.693). */
export function relationsOf(
  details: readonly ArchZoneDetail[],
  nodes: readonly ArchNode[],
): DiagramRelation[] {
  const known = new Set(nodes.map((node) => node.id));
  const seen = new Set<string>();
  const relations: DiagramRelation[] = [];
  for (const detail of details) {
    for (const link of detail.relations) {
      const id = `${link.from}>${link.to}`;
      if (seen.has(id) || !known.has(link.from) || !known.has(link.to)) continue;
      seen.add(id);
      relations.push({
        id,
        from: link.from,
        to: link.to,
        label: link.via,
        labelFont: "sans",
        dashed: link.async === true,
      });
    }
  }
  return relations;
}

/** Couches affichées : celles qui ont un nœud, sans quoi une couche vide mangerait la hauteur ; toutes en vue complète. */
export const bandsOf = (): DiagramBand[] => LANES.map((lane) => ({ ...lane }));

/**
 * Placement par couche (B547) : y centré dans la couche du type, x dans l'ordre des identifiants, séparés de la largeur
 * du nœud et de 24 px. Un nœud d'une autre zone se range dans la couche Services, après les composants.
 */
export function layerPositions(nodes: readonly ArchNode[]): Record<string, DiagramPoint> {
  const next: number[] = LANES.map(() => LANE_LEFT);
  const result: Record<string, DiagramPoint> = {};
  const ordered = [...nodes].sort((a, b) => {
    if (isGhostId(a.id) !== isGhostId(b.id)) return isGhostId(a.id) ? 1 : -1;
    return a.id.localeCompare(b.id, "en");
  });
  for (const node of ordered) {
    const lane = LANE_OF[node.kind];
    const band = LANES[lane];
    if (!band) continue;
    result[node.id] = {
      x: next[lane] ?? LANE_LEFT,
      y: Math.round(band.top + (band.height - node.height) / 2),
    };
    next[lane] = (next[lane] ?? LANE_LEFT) + node.width + GAP;
  }
  return result;
}

/** Positions enregistrées (nœuds affichés seulement) posées sur le placement par couche. */
export function positionsOf(
  nodes: readonly ArchNode[],
  saved: Readonly<Record<string, DiagramPoint>>,
): Record<string, DiagramPoint> {
  const placed = layerPositions(nodes);
  for (const node of nodes) {
    const point = saved[node.id];
    if (point && !isGhostId(node.id)) placed[node.id] = point;
  }
  return placed;
}

/** Légende (maquette 13 l.179-183) : icône et libellé de chaque forme. */
export const LEGEND: ReadonlyArray<{ icon: IconName; label: string }> = [
  { icon: "person", label: "acteur" },
  { icon: "desktop_windows", label: "application" },
  { icon: "hub", label: "service" },
  { icon: "database", label: "stockage" },
  { icon: "cloud", label: "externe" },
];

export const nodeLabel = (kind: ArchNodeKind): string => ARCH_NODE_LABELS[kind];

export const HINT_COMPACT = "Zoom sous 60 % : seuls les noms s'affichent.";
export const HINT = "Cliquez un composant pour voir sa fiche.";
export const zoneHint = (components: number, zones: number): string =>
  `Vue des zones : ${componentsLabel(components)} en ${zones} zones. Cliquez une zone pour l'ouvrir.`;
