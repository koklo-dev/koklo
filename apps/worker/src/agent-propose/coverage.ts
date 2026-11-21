import type { CurrentComponent, CurrentTitle } from "@koklo/db";
import { AGENT_PROPOSE_LIMITS } from "@koklo/domain";
import { type ArchitectureCoverage, architectureCoverage } from "@koklo/schema";
import { stringsOf } from "../job-support.ts";
import type { LaunchSources } from "./sources.ts";
import { proposedComponentId } from "./triage-architecture.ts";

/**
 * Couverture d'un lancement d'Architecture (TK-114b, B616) : l'index (toutes les fonctionnalités, parcours et tables, les
 * composants avec leurs liens, les flux techniques) et les propositions non refusées du lancement. Une proposition `specId`
 * remplace le composant indexé qu'elle met à jour. Pur, sans I/O.
 */
export type IndexedComponent = CurrentComponent;

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
}

/** Union ordonnée de deux listes d'identifiants, `max` au plus (200 : B615). */
export const unionOf = (
  first: readonly string[],
  second: readonly string[],
  max: number = AGENT_PROPOSE_LIMITS.links,
): string[] => [...new Set([...first, ...second])].slice(0, max);

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

/** Composants de l'index puis du lancement (non refusés), par identifiant : une proposition `specId` remplace l'indexé. */
function linksById(index: CoverageIndex, proposals: readonly PublishedProposal[]) {
  const links = new Map(
    index.components.map((c) => [c.specId, { owns: c.owns, serves: c.serves }] as const),
  );
  for (const proposal of liveProposals(proposals)) {
    const id = proposal.kind === "component" ? proposedComponentId(proposal.payload) : undefined;
    if (id === undefined) continue;
    links.set(id, {
      owns: stringsOf(proposal.payload.owns),
      serves: stringsOf(proposal.payload.serves),
    });
  }
  return links;
}

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
    value: { id, possede: links.owns, sert: links.serves },
  }));
  return architectureCoverage({
    features: valued(index.features.map((feature) => feature.specId)),
    flows: valued(index.flows.map((flow) => flow.specId)),
    tables: valued(index.tableIds),
    components,
    archFlows: valued([...new Set([...index.archflows, ...flowsDetailed])]),
  });
}

/** Trous découpés en paquets de 15 fonctionnalités et 5 parcours au plus (B616), dans l'ordre de l'index. */
export function packetsOf(
  index: CoverageIndex,
  holes: Pick<ArchitectureCoverage, "unservedFeatures" | "missingFlows">,
): Packet[] {
  const { features: perFeature, flows: perFlow } = AGENT_PROPOSE_LIMITS.coverage;
  const pick = (items: readonly CurrentTitle[], ids: readonly string[]) => {
    const wanted = new Set(ids);
    return titled(items.filter((item) => wanted.has(item.specId)));
  };
  const features = pick(index.features, holes.unservedFeatures);
  const flows = pick(index.flows, holes.missingFlows);
  const count = Math.max(
    Math.ceil(features.length / perFeature),
    Math.ceil(flows.length / perFlow),
  );
  return Array.from({ length: count }, (_, i) => ({
    features: features.slice(i * perFeature, (i + 1) * perFeature),
    flows: flows.slice(i * perFlow, (i + 1) * perFlow),
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
