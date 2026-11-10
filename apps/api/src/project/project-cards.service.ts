import type { ProjectCardsInput, ProjectCardsOutput } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_ROLES } from "../auth/roles.ts";
import type { AuthSession } from "../auth/session.ts";
import { CLOCK, type Clock } from "../clock.ts";
import { audienceOf } from "../project-overview/project-overview.service.ts";
import {
  PROJECT_CARDS_REPOSITORY,
  type ProjectCardsRepository,
} from "./project-cards.repository.ts";
import { pageOfCards } from "./project-cards.ts";

/** Liste des projets en cartes (TK-93) : lectures groupées, puis filtres, tri, facettes et curseur en mémoire. */
@Injectable()
export class ProjectCardsService {
  constructor(
    @Inject(PROJECT_CARDS_REPOSITORY) private readonly repository: ProjectCardsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** `linkedProjectIds` : `null` pour toute l'organisation, sinon les projets liés du client. */
  async cards(
    session: AuthSession,
    linkedProjectIds: readonly string[] | null,
    query: ProjectCardsInput,
  ): Promise<ProjectCardsOutput> {
    const audience = audienceOf(session.role);
    const manager = MANAGER_ROLES.some((role) => role === session.role);
    const { facts, aiConfigured } = await this.repository.read({
      organizationId: session.organizationId,
      audience,
      visibleProjectIds: linkedProjectIds,
      withAi: audience === "team" && manager,
      canAct: manager,
    });
    return pageOfCards(
      facts,
      { role: session.role ?? "", audience, now: new Date(this.clock.now()), aiConfigured },
      query,
    );
  }
}
