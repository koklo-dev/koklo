import type { CurrentComponent, CurrentDependency, CurrentTitle } from "@koklo/db";
import { AGENT_PROPOSE_LIMITS } from "@koklo/domain";
import { type ArchitectureCoverage, architectureCoverage } from "@koklo/schema";
import { recordsOf, stringsOf } from "../job-support.ts";
import type { LaunchSources } from "./sources.ts";
import { proposedComponentId } from "./triage-architecture.ts";

/**
 * Couverture d'un lancement d'Architecture (TK-114b, B616) : l'index (toutes les fonctionnalités, parcours et tables, les
 * composants avec leurs liens, les flux techniques) et les propositions non refusées du lancement. Une proposition `specId`
 * remplace le composant indexé qu'elle met à jour ; sans `dependsOn`, elle garde les liens de l'index (TK-114c, B633). Pur,
 * sans I/O.
 */
export type IndexedComponent = CurrentComponent;
export type Dependency = CurrentDependency;

export interface CoverageIndex {
  readonly features: readonly CurrentTitle[];
  readonly flows: readonly CurrentTitle[];
  readonly tableIds: readonly string[];
  readonly components: readonly IndexedComponent[];
  readonly archflows: readonly string[];
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
}

export type CoverageCounts = ArchitectureCoverage["counts"];

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
  };
}

export const liveProposals = (proposals: readonly PublishedProposal[]): PublishedProposal[] =>
  proposals.filter((proposal) => proposal.status !== "rejected");

interface ComponentLinks {
  readonly owns: readonly string[];
  readonly serves: readonly string[];
  readonly dependsOn: readonly Dependency[];
  readonly type: string;
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
      { owns: c.owns, serves: c.serves, dependsOn: c.dependsOn ?? [], type: c.type },
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

const valued = (ids: readonly string[]) => ids.map((id) => ({ value: { id } }));

export function coverageOf(
  index: CoverageIndex,
  proposals: readonly PublishedProposal[],
): ArchitectureCoverage {
  const flowsDetailed = liveProposals(proposals).flatMap((proposal) =>
    proposal.kind === "archflow" && typeof proposal.payload.flow === "string"
      ? [proposal.payload.flow]
      : [],
  );
  const components = [...linksById(index, proposals)].map(([id, links]) => ({
    value: {
      id,
      possede: links.owns,
      sert: links.serves,
      type: links.type,
      depend_de: links.dependsOn.map((dep) =>
        dep.async === true ? { vers: dep.to, mode: "asynchrone" } : { vers: dep.to },
      ),
    },
  }));
  return architectureCoverage({
    features: valued(index.features.map((feature) => feature.specId)),
    flows: valued(index.flows.map((flow) => flow.specId)),
    tables: valued(index.tableIds),
    components,
    archFlows: valued([...new Set([...index.archflows, ...flowsDetailed])]),
  });
}

const pick = <T extends { specId: string }>(items: readonly T[], ids: readonly string[]): T[] => {
  const wanted = new Set(ids);
  return items.filter((item) => wanted.has(item.specId));
};

/**
 * Trous découpés en paquets de 15 fonctionnalités, 5 parcours (B616) et 10 composants isolés (TK-114c, B634) au plus, dans
 * l'ordre de l'index ; `components` : les composants connus (`knownComponents`), dans l'ordre de l'index puis du lancement.
 */
export function packetsOf(
  index: CoverageIndex,
  holes: Pick<ArchitectureCoverage, "unservedFeatures" | "missingFlows" | "isolatedComponents">,
  components: readonly KnownComponent[],
): Packet[] {
  const sizes = AGENT_PROPOSE_LIMITS.coverage;
  const features = titled(pick(index.features, holes.unservedFeatures));
  const flows = titled(pick(index.flows, holes.missingFlows));
  const isolated = pick(components, holes.isolatedComponents);
  const count = Math.max(
    Math.ceil(features.length / sizes.features),
    Math.ceil(flows.length / sizes.flows),
    Math.ceil(isolated.length / sizes.components),
  );
  const slice = <T>(items: readonly T[], size: number, i: number) =>
    items.slice(i * size, (i + 1) * size);
  return Array.from({ length: count }, (_, i) => ({
    features: slice(features, sizes.features, i),
    flows: slice(flows, sizes.flows, i),
    components: slice(isolated, sizes.components, i),
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
