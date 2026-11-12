import type { DeliverableKey, DeliverableStatus } from "@koklo/domain";
import type { ProjectScope } from "../tracker/scope.ts";

export const DELIVERABLE_STATUS_SOURCE = Symbol("DELIVERABLE_STATUS_SOURCE");

export type DeliverableStatuses = Record<DeliverableKey, DeliverableStatus>;

/**
 * D'où vient le statut de chaque livrable : `ReviewStatusSource` (lot B), d'après les validations par élément, par bloc et
 * par livrable. La source du lot A (Fonctionnel d'après les reviews par fonctionnalité) a été remplacée sans changer le
 * contrat ni le service.
 */
export interface DeliverableStatusSource {
  statuses(scope: ProjectScope): Promise<DeliverableStatuses>;
}
