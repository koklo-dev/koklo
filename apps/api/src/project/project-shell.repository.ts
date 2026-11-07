import type { ProjectScope } from "../tracker/scope.ts";

export const PROJECT_SHELL_REPOSITORY = Symbol("PROJECT_SHELL_REPOSITORY");

/** Faits bruts d'un projet pour la coquille : des comptes, jamais de contenu de spec. */
export interface ShellRecord {
  id: string;
  name: string;
  featureCount: number;
  validatedBaselines: number;
  /** Tickets du sprint actif ; `null` sans sprint actif. */
  activeSprintTickets: number | null;
}

export interface RecentVisit {
  id: string;
  name: string;
  visitedAt: Date;
}

export interface RecentRequest {
  organizationId: string;
  userId: string;
  /** `null` : toute l'organisation ; sinon les seuls projets liés (rôle cloisonné). */
  linkedProjectIds: readonly string[] | null;
  limit: number;
}

/** Port de la coquille (TK-88). Le contrôle d'accès au projet est fait par l'appelant (`inProject`). */
export interface ProjectShellRepository {
  shell(scope: ProjectScope): Promise<ShellRecord>;
  /** Une ligne par membre et projet : crée ou rafraîchit l'instant de la dernière ouverture. */
  visit(scope: ProjectScope, at: Date): Promise<Date>;
  /** Projets visités par ce membre, du plus récent au plus ancien, restreints aux projets accessibles. */
  recent(request: RecentRequest): Promise<RecentVisit[]>;
}
