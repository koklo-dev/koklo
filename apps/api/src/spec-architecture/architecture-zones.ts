import {
  ARCHITECTURE_ZONE_COMPONENTS_MAX,
  ARCHITECTURE_ZONE_PREVIEW_MAX,
  type ArchitectureZone,
  type ArchitectureZones,
} from "@koklo/contract";
import { ZONE_ICON_DEFAULT, type ZoneStyle } from "@koklo/schema";
import { NO_ZONE_ID, NO_ZONE_NAME, zoneIdOf } from "../spec-data/data-zones.ts";
import { isRecord, texts } from "../spec-read/entity-values.ts";
import { type ComponentNode, componentNode } from "./architecture-values.ts";

/**
 * Zones de l'architecture (TK-112, B546) : calcul pur sur les composants indexés de la tête. Une zone est la valeur `zone`
 * des composants (libellé libre, identifiant par `zoneIdOf` comme les Données) ; les composants sans zone forment « Sans
 * zone », en dernier. Un lien entre deux zones compte les paires de composants reliés par `depend_de`, une fois par paire quel
 * que soit le sens ou le canal. Les acteurs d'une zone sont les rôles `RL-` qui participent à un flux contenant l'un de ses
 * composants.
 */
export type ArchNode = ComponentNode;

export const archNodes = (rows: readonly { specId: string; data: unknown }[]): ArchNode[] =>
  rows.map(({ specId, data }) => componentNode(specId, data));

/** Participants d'un flux indexé (lecture tolérante : texte seulement). */
export interface FlowParticipants {
  participants: string[];
}

export const flowParticipants = (
  rows: readonly { specId: string; data: unknown }[],
): FlowParticipants[] =>
  rows.map(({ data }) => ({ participants: texts(isRecord(data) ? data.participants : undefined) }));

interface Group {
  id: string;
  name: string;
  members: ArchNode[];
}

/** Zones dans l'ordre d'apparition des composants, « Sans zone » en dernier. */
function groupsOf(nodes: readonly ArchNode[]): Group[] {
  const groups = new Map<string, Group>();
  for (const node of nodes) {
    const id = zoneIdOf(node.zone);
    const group = groups.get(id) ?? { id, name: node.zone ?? NO_ZONE_NAME, members: [] };
    group.members.push(node);
    groups.set(id, group);
  }
  const ordered = [...groups.values()];
  return [
    ...ordered.filter((group) => group.id !== NO_ZONE_ID),
    ...ordered.filter((group) => group.id === NO_ZONE_ID),
  ];
}

const isActor = (id: string): boolean => id.startsWith("RL-");

/** Rôles (`RL-`) des flux qui contiennent un composant du groupe, dans l'ordre de première apparition. */
function actorIdsOf(group: Group, flows: readonly FlowParticipants[]): string[] {
  const members = new Set(group.members.map((member) => member.id));
  const actors = new Set<string>();
  for (const flow of flows) {
    if (!flow.participants.some((id) => members.has(id))) continue;
    for (const id of flow.participants) if (isActor(id)) actors.add(id);
  }
  return [...actors];
}

function summaryOf(group: Group, styles: readonly ZoneStyle[]) {
  const style = styles.find((entry) => zoneIdOf(entry.nom) === group.id);
  return {
    id: group.id,
    name: group.id === NO_ZONE_ID ? group.name : (style?.nom ?? group.name),
    icon: style?.icone ?? ZONE_ICON_DEFAULT,
    componentCount: group.members.length,
  };
}

type Links = Map<string, Map<string, number>>;

/** Paires de composants reliés entre zones différentes, comptées par paire de zones (sans sens, sans doublon). */
function crossLinks(nodes: readonly ArchNode[]): Links {
  const zoneIds = new Map(nodes.map((node) => [node.id, zoneIdOf(node.zone)]));
  const seen = new Set<string>();
  const links: Links = new Map();
  const bump = (from: string, to: string) => {
    const row = links.get(from) ?? new Map<string, number>();
    row.set(to, (row.get(to) ?? 0) + 1);
    links.set(from, row);
  };
  for (const node of nodes) {
    for (const { to } of node.dependsOn) {
      const from = zoneIds.get(node.id);
      const target = zoneIds.get(to);
      const pair = [node.id, to].sort().join("|");
      if (from === undefined || target === undefined || from === target || seen.has(pair)) continue;
      seen.add(pair);
      bump(from, target);
      bump(target, from);
    }
  }
  return links;
}

/** Liens d'une zone vers les autres : plus nombreux d'abord, puis dans l'ordre des zones. */
function linksOf(id: string, links: Links, order: readonly string[]) {
  return [...(links.get(id) ?? [])]
    .map(([to, count]) => ({ to, count }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.to) - order.indexOf(b.to));
}

export function buildArchZones(
  nodes: readonly ArchNode[],
  flows: readonly FlowParticipants[],
  styles: readonly ZoneStyle[],
): Pick<ArchitectureZones, "zones" | "componentCount"> {
  const groups = groupsOf(nodes);
  const links = crossLinks(nodes);
  const order = groups.map((group) => group.id);
  return {
    componentCount: nodes.length,
    zones: groups.map((group) => ({
      ...summaryOf(group, styles),
      actorCount: actorIdsOf(group, flows).length,
      preview: group.members.slice(0, ARCHITECTURE_ZONE_PREVIEW_MAX).map((member) => member.name),
      links: linksOf(group.id, links, order),
    })),
  };
}

export interface ArchZoneView {
  zone: ArchitectureZone["zone"];
  /** Composants rendus, 200 au plus. */
  members: ArchNode[];
  relations: ArchitectureZone["relations"];
  actors: ArchitectureZone["actors"];
  outgoing: ArchitectureZone["outgoing"];
  truncated: boolean;
}

/** Une zone ouverte ; `undefined` : identifiant inconnu. `roleNames` : nom d'un rôle `RL-`, repli sur l'identifiant. */
export function buildArchZone(
  nodes: readonly ArchNode[],
  flows: readonly FlowParticipants[],
  styles: readonly ZoneStyle[],
  id: string,
  roleNames: ReadonlyMap<string, string>,
): ArchZoneView | undefined {
  const groups = groupsOf(nodes);
  const group = groups.find((entry) => entry.id === id);
  if (group === undefined) return undefined;
  const members = group.members.slice(0, ARCHITECTURE_ZONE_COMPONENTS_MAX);
  const shown = new Set(members.map((member) => member.id));
  const outgoing = linksOf(
    id,
    crossLinks(nodes),
    groups.map((entry) => entry.id),
  );
  return {
    zone: summaryOf(group, styles),
    members,
    relations: members.flatMap((member) =>
      member.dependsOn
        .filter(({ to }) => shown.has(to))
        .map(({ to, via, async }) => ({
          from: member.id,
          to,
          via,
          ...(async ? { async: true } : {}),
        })),
    ),
    actors: actorIdsOf(group, flows).map((actor) => ({
      id: actor,
      name: roleNames.get(actor) ?? actor,
    })),
    outgoing: outgoing.map(({ to, count }) => ({ zone: to, count })),
    truncated: group.members.length > members.length,
  };
}
