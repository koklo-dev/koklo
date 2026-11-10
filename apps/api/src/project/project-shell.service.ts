import { type ProjectRecent, RECENT_PROJECTS_MAX } from "@koklo/contract";
import { projectTileOf } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthSession } from "../auth/session.ts";
import { CLOCK, type Clock } from "../clock.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  PROJECT_SHELL_REPOSITORY,
  type ProjectShellRepository,
} from "./project-shell.repository.ts";
import { type Deliverable, deliverablesOf, type ProjectPhase, phaseOf } from "./project-shell.ts";

export interface ProjectShell {
  id: string;
  name: string;
  phase: ProjectPhase;
  deliverables: Deliverable[];
  validatedCount: number;
  ticketCount: number | null;
}

@Injectable()
export class ProjectShellService {
  constructor(
    @Inject(PROJECT_SHELL_REPOSITORY) private readonly repository: ProjectShellRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async shell(scope: ProjectScope): Promise<ProjectShell> {
    const record = await this.repository.shell(scope);
    return {
      id: record.id,
      name: record.name,
      phase: phaseOf(record),
      deliverables: deliverablesOf(record),
      // Aucun livrable n'est validable avant TK-100 : le compteur reste à zéro (B77).
      validatedCount: 0,
      ticketCount: record.activeSprintTickets,
    };
  }

  async visit(scope: ProjectScope): Promise<{ visitedAt: string }> {
    const visitedAt = await this.repository.visit(scope, new Date(this.clock.now()));
    return { visitedAt: visitedAt.toISOString() };
  }

  /** `linkedProjectIds` : `null` pour toute l'organisation, sinon les projets liés (cloisonnement). */
  async recent(
    session: AuthSession,
    linkedProjectIds: readonly string[] | null,
  ): Promise<ProjectRecent[]> {
    const visits = await this.repository.recent({
      organizationId: session.organizationId,
      userId: session.userId,
      linkedProjectIds,
      limit: RECENT_PROJECTS_MAX,
    });
    return visits.map((visit) => ({
      ...visit,
      ...projectTileOf(visit.id, visit.name),
      visitedAt: visit.visitedAt.toISOString(),
    }));
  }
}
