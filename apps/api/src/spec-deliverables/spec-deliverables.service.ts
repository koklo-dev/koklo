import type { SpecDeliverable, SpecDeliverablesOutput } from "@koklo/contract";
import {
  type DeliverableKey,
  type DeliverableStatus,
  deliverablesAvailabilityOf,
} from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { SPEC_BATCH_ROLES, STAFF_ROLES } from "../auth/roles.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { type StaleBecause, staleBecauseOf, staleStatus } from "./deliverable-impact.ts";
import {
  DELIVERABLE_STATUS_SOURCE,
  type DeliverableStatusSource,
} from "./deliverable-status-source.ts";
import {
  type SecurityImpact,
  type StaleImpact,
  securityImpactOf,
  staleImpactOf,
  type TechnicalImpact,
  technicalImpactOf,
} from "./deliverable-upstream.ts";
import {
  SPEC_DELIVERABLES_REPOSITORY,
  type SpecDeliverablesRepository,
} from "./spec-deliverables.repository.ts";

/** Seule l'équipe voit les propositions de l'agent ; un rôle absent ou inconnu est traité comme le client (fermé par défaut). */
const sees = (role: string | undefined): boolean =>
  role !== undefined && STAFF_ROLES.some((staff) => staff === role);

/** La Sécurité (ses propositions et ce qui est à revoir) : l'équipe et le designer seuls (TK-117, B803, B810). */
const seesSecurity = (role: string | undefined): boolean =>
  SPEC_BATCH_ROLES.some((reader) => reader === role);

/** Les livrables périmés par une nouvelle version d'idée passent « À revoir », quel que soit leur statut. */
const staleStatuses = (
  statuses: Record<DeliverableKey, DeliverableStatus>,
  stale: Partial<Record<DeliverableKey, StaleBecause>>,
) =>
  Object.fromEntries(
    Object.entries(statuses).map(([key, status]) => [
      key,
      staleStatus(status, stale[key as DeliverableKey] !== undefined),
    ]),
  ) as Record<DeliverableKey, DeliverableStatus>;

interface Impacts {
  data: StaleImpact;
  architecture: StaleImpact;
  technical: TechnicalImpact;
  security: SecurityImpact;
}

/**
 * Un amont modifié depuis la décision rend les Données (B449), l'Architecture (TK-113), le Technique (TK-115) ou la
 * Sécurité (TK-117) « À revoir ».
 */
const withUpstream = (statuses: Record<DeliverableKey, DeliverableStatus>, impacts: Impacts) => ({
  ...statuses,
  data: staleStatus(statuses.data, impacts.data.upstream.length > 0),
  architecture: staleStatus(statuses.architecture, impacts.architecture.upstream.length > 0),
  technical: staleStatus(statuses.technical, impacts.technical.changes.length > 0),
  security: staleStatus(statuses.security, impacts.security.changes.length > 0),
});

/**
 * Ce que l'impact amont ajoute à l'entrée d'un livrable : les amonts, pour l'Architecture les éléments concernés, pour le
 * Technique et la Sécurité les changements et ce qui les cite (la Sécurité : jamais au client ni au rôle business).
 */
function impactFields(key: DeliverableKey, impacts: Impacts, security: boolean) {
  if (key === "security") {
    const impact = impacts.security;
    return security && impact.changes.length > 0 ? { staleSecurity: impact } : {};
  }
  if (key === "technical") {
    const impact = impacts.technical;
    return impact.changes.length === 0 ? {} : { staleTechnical: impact };
  }
  if (key !== "data" && key !== "architecture") return {};
  const { upstream, components, flows } = impacts[key];
  if (upstream.length === 0) return {};
  return key === "data"
    ? { staleUpstream: upstream }
    : {
        staleUpstream: upstream,
        ...(components.length > 0 ? { staleComponents: components } : {}),
        ...(flows.length > 0 ? { staleFlows: flows } : {}),
      };
}

/**
 * Les sept livrables de la spec (TK-100) : faits lus en base, statut fourni par la source de statuts, disponibilité
 * calculée par le domaine (B1). Lu par `spec.deliverables` et par `project.shell`.
 */
@Injectable()
export class SpecDeliverablesService {
  constructor(
    @Inject(SPEC_DELIVERABLES_REPOSITORY) private readonly repository: SpecDeliverablesRepository,
    @Inject(DELIVERABLE_STATUS_SOURCE) private readonly statuses: DeliverableStatusSource,
  ) {}

  async list(scope: ProjectScope, role: string | undefined): Promise<SpecDeliverablesOutput> {
    const withPending = sees(role);
    const [record, statuses] = await Promise.all([
      this.repository.read(scope, { withPending }),
      this.statuses.statuses(scope),
    ]);
    const stale = staleBecauseOf(record.impact);
    const impacts = {
      data: staleImpactOf(record.upstream.data),
      architecture: staleImpactOf(record.upstream.architecture),
      technical: technicalImpactOf(record.technicalUpstream),
      security: securityImpactOf(record.securityUpstream),
    };
    const security = seesSecurity(role);
    const deliverables: SpecDeliverable[] = deliverablesAvailabilityOf({
      ideaFrozen: record.ideaFrozen,
      functionalHasEntity: record.featureCount > 0,
      statuses: staleStatuses(withUpstream(statuses, impacts), stale),
      forced: record.forced,
    }).map((entry) => ({
      ...entry,
      pendingProposals:
        entry.key === "security" && !security ? 0 : (record.pendingByDeliverable[entry.key] ?? 0),
      ...(stale[entry.key] ? { staleBecause: stale[entry.key] } : {}),
      ...impactFields(entry.key, impacts, security),
    }));
    return {
      deliverables,
      validatedCount: deliverables.filter((entry) => entry.status === "validated").length,
    };
  }

  /** Pourquoi le livrable est « À revoir » (nouvelle version d'idée), ou `undefined` s'il ne l'est pas. */
  async staleBecause(scope: ProjectScope, key: DeliverableKey): Promise<StaleBecause | undefined> {
    const record = await this.repository.read(scope, { withPending: false });
    return staleBecauseOf(record.impact)[key];
  }

  /** Ouvre le livrable sans rien valider (idempotent, audité à la première fois) et rend son entrée. */
  async force(scope: ProjectScope, role: string | undefined, key: DeliverableKey) {
    await this.repository.force(scope, key);
    const { deliverables } = await this.list(scope, role);
    return deliverables.find((entry) => entry.key === key) as SpecDeliverable;
  }
}
