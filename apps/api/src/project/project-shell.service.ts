import { type ProjectRecent, RECENT_PROJECTS_MAX } from "@koklo/contract";
import { type DeliverableKey, deliverableAfterOf, projectTileOf } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthSession } from "../auth/session.ts";
import { CLOCK, type Clock } from "../clock.ts";
import { SpecDeliverablesService } from "../spec-deliverables/spec-deliverables.service.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  PROJECT_SHELL_REPOSITORY,
  type ProjectShellRepository,
} from "./project-shell.repository.ts";
import { type ProjectPhase, phaseOf } from "./project-shell.ts";

export interface ProjectShell {
  id: string;
  name: string;
  phase: ProjectPhase;
  deliverables: { key: DeliverableKey; available: boolean; after: string | null }[];
  validatedCount: number;
  ticketCount: number | null;
}

@Injectable()
export class ProjectShellService {
  constructor(
    @Inject(PROJECT_SHELL_REPOSITORY) private readonly repository: ProjectShellRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SpecDeliverablesService) private readonly deliverables: SpecDeliverablesService,
  ) {}

  /** Disponibilité et compteur « SPEC N/7 » viennent de `spec.deliverables` (TK-100) ; le rôle n'y change rien. */
  async shell(scope: ProjectScope, role: string | undefined): Promise<ProjectShell> {
    const [record, spec] = await Promise.all([
      this.repository.shell(scope),
      this.deliverables.list(scope, role),
    ]);
    return {
      id: record.id,
      name: record.name,
      phase: phaseOf(record),
      deliverables: spec.deliverables.map(({ key, available }) => ({
        key,
        available,
        after: deliverableAfterOf(key),
      })),
      validatedCount: spec.validatedCount,
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
