import {
  ARCHITECTURE_ZONE_COMPONENTS_MAX,
  ARCHITECTURE_ZONE_PREVIEW_MAX,
  type ArchitectureZone,
  type ArchitectureZones,
} from "@koklo/contract";
import {
  type Exchange,
  entryAppsOf,
  exchangesOf,
  type FlowItemInput,
  roleSideOf,
  ZONE_ICON_DEFAULT,
  type ZoneStyle,
} from "@koklo/schema";
import { NO_ZONE_ID, NO_ZONE_NAME, zoneIdOf } from "../spec-data/data-zones.ts";
import { isRecord, texts } from "../spec-read/entity-values.ts";
import { type ComponentNode, componentNode } from "./architecture-values.ts";

/**
 * Zones de l'architecture (TK-112, B546) : calcul pur sur les composants indexés de la tête. Une zone est la valeur `zone`
 * des composants (libellé libre, identifiant par `zoneIdOf` comme les Données) ; les composants sans zone forment « Sans
 * zone », en dernier. Un lien entre deux zones compte les paires de composants reliés par `depend_de`, une fois par paire quel
 * que soit le sens ou le canal. Les acteurs d'une zone (TK-114d, B654) sont les `acteurs` de ses applications, les rôles qui
 * échangent avec l'une d'elles dans un flux, et les rôles des flux qui touchent ses composants seulement si le rôle n'a aucune
 * application d'entrée.
 */
export type ArchNode = ComponentNode;

export const archNodes = (rows: readonly { specId: string; data: unknown }[]): ArchNode[] =>
  rows.map(({ specId, data }) => componentNode(specId, data));

/** Participants et messages d'un flux indexé (lecture tolérante : texte seulement ; messages absents des fixtures). */
export interface FlowParticipants {
  participants: string[];
  messages?: FlowItemInput[];
}

/** Messages `de`/`vers` d'un flux, blocs `alt` compris ; un élément illisible est ignoré. */
function fileItemsOf(value: unknown): FlowItemInput[] {
  return (Array.isArray(value) ? value : []).flatMap((item): FlowItemInput[] => {
    if (!isRecord(item)) return [];
    if (typeof item.bloc === "string")
      return [{ bloc: item.bloc, messages: fileItemsOf(item.messages) }];
    return typeof item.de === "string" && typeof item.vers === "string"
      ? [{ de: item.de, vers: item.vers }]
      : [];
  });
}

export const flowParticipants = (
  rows: readonly { specId: string; data: unknown }[],
): FlowParticipants[] =>
  rows.map(({ data }) => {
    const json = isRecord(data) ? data : {};
    return { participants: texts(json.participants), messages: fileItemsOf(json.messages) };
  });

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

/** Ce que les acteurs d'une zone lisent : les applications d'entrée de chaque rôle et les échanges des flux. */
export interface ActorContext {
  readonly flows: readonly FlowParticipants[];
  readonly entryApps: ReadonlyMap<string, readonly string[]>;
  readonly exchanges: readonly Exchange[];
}

export function actorContextOf(
  nodes: readonly ArchNode[],
  flows: readonly FlowParticipants[],
): ActorContext {
  const roleFlows = flows.map((flow, i) => ({ id: String(i), messages: flow.messages ?? [] }));
  return {
    flows,
    entryApps: entryAppsOf(
      nodes.map(({ id, type, actors }) => ({ id, type, acteurs: actors.filter(isActor) })),
      roleFlows,
    ),
    exchanges: roleFlows.flatMap((flow) => exchangesOf(flow.messages)),
  };
}

/** Rôle → application de la zone : `acteurs` de l'application, puis rôles qui échangent avec elle (B654). */
function actorRelationsOf(
  members: readonly ArchNode[],
  context: ActorContext,
): ArchitectureZone["actorRelations"] {
  const apps = members.filter((member) => member.type === "app");
  const appIds = new Set(apps.map((app) => app.id));
  const pairs = [
    ...apps.flatMap((app) =>
      app.actors.filter(isActor).map((role) => ({ from: role, to: app.id })),
    ),
    ...context.exchanges.flatMap((exchange) => {
      const side = roleSideOf(exchange);
      return side !== undefined && appIds.has(side.component)
        ? [{ from: side.role, to: side.component }]
        : [];
    }),
  ];
  const seen = new Set<string>();
  return pairs.filter((pair) => {
    const key = `${pair.from}|${pair.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Acteurs du groupe (B654), dans l'ordre de première apparition : ceux de ses applications, puis les rôles sans application. */
function actorIdsOf(group: Group, context: ActorContext): string[] {
  const members = new Set(group.members.map((member) => member.id));
  const actors = new Set(actorRelationsOf(group.members, context).map((pair) => pair.from));
  for (const flow of context.flows) {
    if (!flow.participants.some((id) => members.has(id))) continue;
    for (const id of flow.participants) {
      if (isActor(id) && (context.entryApps.get(id) ?? []).length === 0) actors.add(id);
    }
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
  const context = actorContextOf(nodes, flows);
  return {
    componentCount: nodes.length,
    zones: groups.map((group) => ({
      ...summaryOf(group, styles),
      actorCount: actorIdsOf(group, context).length,
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
  /** Liens entre un composant rendu et un composant d'une autre zone, dans les deux sens (TK-114c, B640). */
  crossRelations: ArchitectureZone["crossRelations"];
  actors: ArchitectureZone["actors"];
  /** Rôle → application rendue de la zone (TK-114d, B654). */
  actorRelations: ArchitectureZone["actorRelations"];
  outgoing: ArchitectureZone["outgoing"];
  truncated: boolean;
}

const relationOf = (from: string, { to, via, async }: ArchNode["dependsOn"][number]) => ({
  from,
  to,
  via,
  ...(async ? { async: true } : {}),
});

/**
 * Liens inter-zones d'une zone ouverte : d'abord ceux de ses composants rendus vers une autre zone, puis ceux d'un composant
 * d'une autre zone vers eux ; `zone` = identifiant de l'autre zone. Une cible inconnue de la tête est ignorée.
 */
function crossRelationsOf(
  nodes: readonly ArchNode[],
  members: readonly ArchNode[],
  id: string,
): ArchitectureZone["crossRelations"] {
  const zoneIds = new Map(nodes.map((node) => [node.id, zoneIdOf(node.zone)]));
  const shown = new Set(members.map((member) => member.id));
  const outside = (other: string) => {
    const zone = zoneIds.get(other);
    return zone === undefined || zone === id ? undefined : zone;
  };
  const outgoing = members.flatMap((member) =>
    member.dependsOn.flatMap((dep) => {
      const zone = outside(dep.to);
      return zone === undefined ? [] : [{ ...relationOf(member.id, dep), zone }];
    }),
  );
  const incoming = nodes.flatMap((node) => {
    const zone = outside(node.id);
    if (zone === undefined) return [];
    return node.dependsOn
      .filter((dep) => shown.has(dep.to))
      .map((dep) => ({ ...relationOf(node.id, dep), zone }));
  });
  return [...outgoing, ...incoming];
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
  const context = actorContextOf(nodes, flows);
  return {
    zone: summaryOf(group, styles),
    members,
    relations: members.flatMap((member) =>
      member.dependsOn.filter(({ to }) => shown.has(to)).map((dep) => relationOf(member.id, dep)),
    ),
    crossRelations: crossRelationsOf(nodes, members, id),
    actors: actorIdsOf(group, context).map((actor) => ({
      id: actor,
      name: roleNames.get(actor) ?? actor,
    })),
    actorRelations: actorRelationsOf(members, context),
    outgoing: outgoing.map(({ to, count }) => ({ zone: to, count })),
    truncated: group.members.length > members.length,
  };
}
