import type { AgentLaunchStatus } from "@koklo/domain";
import type { ProjectScope } from "../tracker/scope.ts";

export const LAUNCH_REPOSITORY = Symbol("LAUNCH_REPOSITORY");

export interface LaunchRecord {
  id: string;
  deliverable: string;
  mode: string;
  status: AgentLaunchStatus;
  errorCode: string | null;
  proposedCount: number;
  discardedCount: number;
  baseVersion: number | null;
  requestedBy: string;
  lastSeenAt: Date | null;
  finishedAt: Date | null;
}

/** Ce que l'API fixe à la création d'un lancement ; le reste (statut, compteurs) a ses valeurs de départ. */
export interface NewLaunch {
  deliverable: string;
  mode: string;
  instruction: string | null;
  sources: readonly string[];
  baseVersion: number | null;
}

/** Lancement créé sous verrou, ou lancement déjà actif du même livrable (index unique partiel). */
export type LaunchOutcome =
  | { kind: "created"; launch: LaunchRecord }
  | { kind: "busy"; launchId: string };

/** Faits en base dont se déduisent les options du popover : aucun n'est une estimation. */
export interface OptionFacts {
  /** Fonctionnalités du cahier indexé sans aucun critère. */
  withoutCriteria: number;
}

/** Accès aux lancements d'agent du projet ; chaque méthode est une transaction courte, sans réseau. */
export interface LaunchRepository {
  /** Numéro de la dernière version `idea-vN` figée (commit réglé), `null` sans version. */
  frozenVersion(scope: ProjectScope): Promise<number | null>;
  /**
   * Reprend d'abord le lancement `running` sans signal depuis plus de 5 minutes (`failed` / `worker_lost`), puis
   * insère. Le verrou est l'index unique partiel : un conflit rend `busy`, jamais une erreur.
   */
  create(scope: ProjectScope, launch: NewLaunch, now: Date): Promise<LaunchOutcome>;
  /** Retire un lancement sans proposition (admission refusée après l'insertion) : le verrou est libéré. */
  discard(scope: ProjectScope, launchId: string): Promise<void>;
  /** Échec côté API (enfilage impossible) : le lancement passe `failed`, le verrou est libéré. */
  fail(scope: ProjectScope, launchId: string, errorCode: string, now: Date): Promise<void>;
  optionFacts(scope: ProjectScope): Promise<OptionFacts>;
  /** Vrai si la tête de spec porte au moins une entité du Fonctionnel (fonctionnalité, règle, rôles, parcours). */
  hasFunctionalEntities(scope: ProjectScope): Promise<boolean>;
  /** Le lancement désigné, ou le dernier du livrable ; `null` s'il n'y en a pas (ou hors du projet). */
  forList(
    scope: ProjectScope,
    deliverable: string | undefined,
    launchId: string | undefined,
  ): Promise<LaunchRecord | null>;
  /** `lastSeenAt` = `now`, au plus toutes les `throttleMs` (aucune écriture sinon). */
  touchSeen(scope: ProjectScope, launchId: string, now: Date, throttleMs: number): Promise<void>;
}
