import type { CurrentArchflow, CurrentComponent, CurrentDependency, CurrentTitle } from "@koklo/db";
import { AGENT_PROPOSE_LIMITS } from "@koklo/domain";
import {
  type ArchitectureCoverage,
  architectureCoverage,
  type FlowItemInput,
  type RoleFlow,
} from "@koklo/schema";
import { recordsOf, stringsOf } from "../job-support.ts";
import type { LaunchSources } from "./sources.ts";
import { proposedComponentId } from "./triage-architecture.ts";

/**
 * Couverture d'un lancement d'Architecture (TK-114b, B616) : l'index (toutes les fonctionnalités, parcours et tables, les
 * composants avec leurs liens, les flux techniques) et les propositions non refusées du lancement. Une proposition `specId`
 * remplace le composant indexé qu'elle met à jour ; sans `dependsOn`, elle garde les liens de l'index (TK-114c, B633).
 * TK-114d (B651) : les rôles, les `actors` des composants et les messages des flux (une reprise remplace le flux indexé).
 * Pur, sans I/O.
 */
export type IndexedComponent = CurrentComponent;
export type Dependency = CurrentDependency;

export interface CoverageIndex {
  readonly features: readonly CurrentTitle[];
  readonly flows: readonly CurrentTitle[];
  readonly tableIds: readonly string[];
  readonly components: readonly IndexedComponent[];
  readonly archflows: readonly string[];
  /** Flux techniques indexés avec leurs messages (TK-114d, B655) ; absent : aucun message connu. */
  readonly technicalFlows?: readonly CurrentArchflow[];
  /** Rôles du domaine (TK-114d, B651) ; absent : aucun. */
  readonly roles?: readonly CurrentTitle[];
}

/** Proposition déjà publiée du lancement, telle que le magasin la relit. */
export interface PublishedProposal {
  readonly id: string;
  readonly kind: string;
  readonly zone: string;
  readonly title: string;
  readonly status: string;
  /** Appliquée par un lot de spec : plus jamais modifiée. */
  readonly applied: boolean;
  readonly payload: Record<string, unknown>;
}

/** Liens ajoutés à une proposition `pending` non appliquée du lancement (B621). */
export interface Complement {
  readonly id: string;
  readonly owns: readonly string[];
  readonly serves: readonly string[];
  /** Dépendances ajoutées (TK-114c, B636) ; absent ou vide : `dependsOn` inchangé. */
  readonly dependsOn?: readonly Dependency[];
  /** Rôles ajoutés (TK-114d, B653) ; absent ou vide : `actors` inchangé. */
  readonly actors?: readonly string[];
}

/** Motifs fermés d'un flux direct non repris (B655). */
export type RepriseSkipReason = "too_long" | "no_entry_app" | "cap";
export interface RepriseCount {
  readonly covered: number;
  readonly total: number;
  readonly skipped?: readonly { readonly reason: RepriseSkipReason; readonly count: number }[];
}

/** Compteurs écrits dans le bilan : ceux de la couverture, et les flux repris (TK-114d, B660). */
export type CoverageCounts = ArchitectureCoverage["counts"] & { readonly reprises?: RepriseCount };

/** Composant connu tel que le prompt de couverture le cite : jamais la responsabilité ni les liens (B622). */
export interface KnownComponent {
  readonly specId: string;
  readonly title: string;
  readonly zone: string | null;
  readonly type: string;
}

export interface Packet {
  readonly features: readonly CurrentTitle[];
  readonly flows: readonly CurrentTitle[];
  /** Composants isolés du paquet, 10 au plus (TK-114c, B634). */
  readonly components: readonly KnownComponent[];
  /** Rôles sans application d'entrée, 5 au plus (TK-114d, B653) ; absent : aucun. */
  readonly roles?: readonly RolePacket[];
}

/** Rôle sans application d'entrée tel que le prompt le cite : identifiant, nom, composants que ses flux appellent. */
export interface RolePacket {
  readonly specId: string;
  readonly title: string;
  readonly calls: readonly string[];
}

/** Union ordonnée de deux listes d'identifiants, `max` au plus (200 : B615). */
export const unionOf = (
  first: readonly string[],
  second: readonly string[],
  max: number = AGENT_PROPOSE_LIMITS.links,
): string[] => [...new Set([...first, ...second])].slice(0, max);

/** Dépendances d'un composant (B635) : 30 au plus, comme `dependsOn` du schéma de proposition. */
export const DEPENDENCIES_MAX = 30;

/** Union ordonnée de deux listes de dépendances par cible `to` (la première gagne), 30 au plus. */
export function dependencyUnion(
  first: readonly Dependency[],
  second: readonly Dependency[],
): Dependency[] {
  const byTarget = new Map<string, Dependency>();
  for (const dep of [...first, ...second]) if (!byTarget.has(dep.to)) byTarget.set(dep.to, dep);
  return [...byTarget.values()].slice(0, DEPENDENCIES_MAX);
}

/** Dépendances d'une charge de proposition, `{ to, via, async? }` bien formées seulement. */
export const dependenciesOf = (value: unknown): Dependency[] =>
  recordsOf(value).flatMap(({ to, via, async }) =>
    typeof to === "string" && typeof via === "string"
      ? [async === true ? { to, via, async: true } : { to, via }]
      : [],
  );

const titled = (items: readonly CurrentTitle[]): CurrentTitle[] =>
  items.map(({ specId, title }) => ({ specId, title }));

export function coverageIndexOf(sources: LaunchSources): CoverageIndex {
  return {
    features: titled(sources.features),
    flows: titled(sources.flows),
    tableIds: sources.tableIds ?? (sources.tables ?? []).map((table) => table.specId),
    components: sources.architecture?.components ?? [],
    archflows: (sources.architecture?.archflows ?? []).map((item) => item.specId),
    technicalFlows: sources.architecture?.archflows ?? [],
    roles: titled(sources.roles),
  };
}

export const liveProposals = (proposals: readonly PublishedProposal[]): PublishedProposal[] =>
  proposals.filter((proposal) => proposal.status !== "rejected");

interface ComponentLinks {
  readonly owns: readonly string[];
  readonly serves: readonly string[];
  readonly dependsOn: readonly Dependency[];
  readonly type: string;
  readonly actors: readonly string[];
}

/**
 * Composants de l'index puis du lancement (non refusés), par identifiant : une proposition `specId` remplace l'indexé ; sans
 * `dependsOn` ni `type`, elle garde ceux de l'index (B633).
 */
function linksById(
  index: CoverageIndex,
  proposals: readonly PublishedProposal[],
): Map<string, ComponentLinks> {
  const links = new Map<string, ComponentLinks>(
    index.components.map((c) => [
      c.specId,
      {
        owns: c.owns,
        serves: c.serves,
        dependsOn: c.dependsOn ?? [],
        type: c.type,
        actors: c.actors ?? [],
      },
    ]),
  );
  for (const proposal of liveProposals(proposals)) {
    const id = proposal.kind === "component" ? proposedComponentId(proposal.payload) : undefined;
    if (id === undefined) continue;
    const { payload } = proposal;
    const previous = links.get(id);
    links.set(id, {
      owns: stringsOf(payload.owns),
      serves: stringsOf(payload.serves),
      dependsOn: Array.isArray(payload.dependsOn)
        ? dependenciesOf(payload.dependsOn)
        : (previous?.dependsOn ?? []),
      type: typeof payload.type === "string" ? payload.type : (previous?.type ?? ""),
      actors: Array.isArray(payload.actors) ? stringsOf(payload.actors) : (previous?.actors ?? []),
    });
  }
  return links;
}

/** Dépendances actuelles de chaque composant connu (index, lancement non refusé), par identifiant (B635). */
export const dependenciesById = (
  index: CoverageIndex,
  proposals: readonly PublishedProposal[],
): Map<string, readonly Dependency[]> =>
  new Map([...linksById(index, proposals)].map(([id, links]) => [id, links.dependsOn]));

/** Rôles actuels de chaque composant connu (index, lancement non refusé), par identifiant (TK-114d, B653). */
export const actorsById = (
  index: CoverageIndex,
  proposals: readonly PublishedProposal[],
): Map<string, readonly string[]> =>
  new Map([...linksById(index, proposals)].map(([id, links]) => [id, links.actors]));

const valued = (ids: readonly string[]) => ids.map((id) => ({ value: { id } }));

/** Messages en forme de proposition (`from`/`to`, `block`) vers la forme du fichier que lit `@koklo/schema`. */
export const fileItemsOf = (items: unknown): FlowItemInput[] =>
  recordsOf(items).map((item) =>
    typeof item.block === "string"
      ? { bloc: item.block, messages: fileItemsOf(item.messages) }
      : { de: String(item.from), vers: String(item.to) },
  );

/**
 * Flux techniques actuels, par parcours : l'index (avec ses messages), puis les flux non refusés du lancement ; un flux repris
 * (`specId`) remplace le flux indexé (B651).
 */
export function flowsOf(
  index: CoverageIndex,
  proposals: readonly PublishedProposal[],
): Map<string, RoleFlow> {
  const flows = new Map<string, RoleFlow>(index.archflows.map((id) => [id, { id }]));
  for (const flow of index.technicalFlows ?? []) {
    flows.set(flow.specId, { id: flow.specId, messages: fileItemsOf(flow.messages) });
  }
  for (const { kind, payload } of liveProposals(proposals)) {
    if (kind !== "archflow" || typeof payload.flow !== "string") continue;
    flows.set(payload.flow, { id: payload.flow, messages: fileItemsOf(payload.messages) });
  }
  return flows;
}

/** Composants actuels (index, lancement non refusé) dans la forme que lit `architectureCoverage`. */
export const coverageComponentsOf = (
  index: CoverageIndex,
  proposals: readonly PublishedProposal[],
) =>
  [...linksById(index, proposals)].map(([id, links]) => ({
    value: {
      id,
      possede: links.owns,
      sert: links.serves,
      type: links.type,
      acteurs: links.actors,
      depend_de: links.dependsOn.map((dep) =>
        dep.async === true ? { vers: dep.to, mode: "asynchrone" } : { vers: dep.to },
      ),
    },
  }));

export function coverageOf(
  index: CoverageIndex,
  proposals: readonly PublishedProposal[],
): ArchitectureCoverage {
  return architectureCoverage({
    features: valued(index.features.map((feature) => feature.specId)),
    flows: valued(index.flows.map((flow) => flow.specId)),
    tables: valued(index.tableIds),
    roles: valued((index.roles ?? []).map((role) => role.specId)),
    components: coverageComponentsOf(index, proposals),
    archFlows: [...flowsOf(index, proposals).values()].map((value) => ({ value })),
  });
}

const pick = <T extends { specId: string }>(items: readonly T[], ids: readonly string[]): T[] => {
  const wanted = new Set(ids);
  return items.filter((item) => wanted.has(item.specId));
};

/**
 * Trous découpés en paquets de 15 fonctionnalités, 5 parcours (B616), 10 composants isolés (TK-114c, B634) et 5 rôles sans
 * application (TK-114d, B653) au plus, dans l'ordre de l'index ; `components` : les composants connus (`knownComponents`),
 * dans l'ordre de l'index puis du lancement ; `roles` : les rôles avec les composants qu'ils appellent (`rolePacketsOf`).
 */
export function packetsOf(
  index: CoverageIndex,
  holes: Pick<ArchitectureCoverage, "unservedFeatures" | "missingFlows" | "isolatedComponents"> &
    Partial<Pick<ArchitectureCoverage, "rolesWithoutApp">>,
  components: readonly KnownComponent[],
  roles: readonly RolePacket[] = [],
): Packet[] {
  const sizes = AGENT_PROPOSE_LIMITS.coverage;
  const features = titled(pick(index.features, holes.unservedFeatures));
  const flows = titled(pick(index.flows, holes.missingFlows));
  const isolated = pick(components, holes.isolatedComponents);
  const lonely = pick(roles, holes.rolesWithoutApp ?? []);
  const count = Math.max(
    Math.ceil(features.length / sizes.features),
    Math.ceil(flows.length / sizes.flows),
    Math.ceil(isolated.length / sizes.components),
    Math.ceil(lonely.length / sizes.roles),
  );
  const slice = <T>(items: readonly T[], size: number, i: number) =>
    items.slice(i * size, (i + 1) * size);
  return Array.from({ length: count }, (_, i) => ({
    features: slice(features, sizes.features, i),
    flows: slice(flows, sizes.flows, i),
    components: slice(isolated, sizes.components, i),
    roles: slice(lonely, sizes.roles, i),
  }));
}

const textOf = (value: unknown): string => (typeof value === "string" ? value : "");

/** Composants que le modèle peut viser : ceux de l'index, puis ceux du lancement (non refusés), une fois chacun. */
export function knownComponents(
  index: CoverageIndex,
  proposals: readonly PublishedProposal[],
): KnownComponent[] {
  const known = new Map<string, KnownComponent>(
    index.components.map(({ specId, title, zone, type }) => [
      specId,
      { specId, title, zone, type },
    ]),
  );
  for (const proposal of liveProposals(proposals)) {
    const id = proposal.kind === "component" ? proposedComponentId(proposal.payload) : undefined;
    if (id === undefined || known.has(id)) continue;
    const { payload } = proposal;
    known.set(id, {
      specId: id,
      title: textOf(payload.name),
      zone: textOf(payload.zone) || null,
      type: textOf(payload.type),
    });
  }
  return [...known.values()];
}
