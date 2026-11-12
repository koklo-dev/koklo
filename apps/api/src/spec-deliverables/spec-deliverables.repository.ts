import type { DeliverableKey } from "@koklo/domain";
import type { ProjectScope } from "../tracker/scope.ts";
import type { IdeaImpact } from "./deliverable-impact.ts";

export const SPEC_DELIVERABLES_REPOSITORY = Symbol("SPEC_DELIVERABLES_REPOSITORY");

/** Faits bruts qui décident de la disponibilité des livrables : des comptes et des clés, jamais de contenu de spec. */
export interface DeliverableRecord {
  /** Une version `idea-vN` dont le lot est commité. */
  ideaFrozen: boolean;
  /** Fonctionnalités de l'instantané courant de la spec. */
  featureCount: number;
  /** Livrables ouverts par un forçage (`deliverable_overrides`). */
  forced: DeliverableKey[];
  /** Impact de la dernière version d'idée figée ; `null` sans version précédente ou sans page changée. */
  impact: IdeaImpact | null;
  /** Propositions de l'agent en attente, par livrable (vide si `withPending` est faux). */
  pendingByDeliverable: Partial<Record<DeliverableKey, number>>;
}

export interface ForceResult {
  id: string;
  /** Faux quand le livrable était déjà forcé : rien n'est écrit ni audité. */
  created: boolean;
}

/** Port des livrables de la spec (TK-100). L'accès au projet est contrôlé par l'appelant (`inProject`). */
export interface SpecDeliverablesRepository {
  read(scope: ProjectScope, options: { withPending: boolean }): Promise<DeliverableRecord>;
  /** Pose le forçage et journalise `deliverable.force` dans la même transaction ; idempotent. */
  force(scope: ProjectScope, key: DeliverableKey): Promise<ForceResult>;
}
