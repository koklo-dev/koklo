import { SEARCH_RESULTS_MAX } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthSession } from "../auth/session.ts";
import { isProjectScoped, type ProjectAccess } from "../project/project-access.ts";
import { SEARCH_REPOSITORY, type SearchHit, type SearchRepository } from "./search.repository.ts";

export interface SearchPage {
  items: SearchHit[];
  nextCursor: null;
  previousCursor: null;
  offset: 0;
  total: number;
}

@Injectable()
export class SearchService {
  constructor(@Inject(SEARCH_REPOSITORY) private readonly repository: SearchRepository) {}

  /**
   * Recherche de la palette (B81). Le projet courant est contrôlé avant tout travail (404 uniforme) ;
   * un rôle cloisonné ne reçoit jamais de fonctionnalité, ni même par identifiant exact (D7).
   */
  async query(
    session: AuthSession,
    access: ProjectAccess,
    input: { q: string; projectId?: string },
  ): Promise<SearchPage> {
    if (input.projectId) {
      await access.assertAccessible(session, input.projectId);
    }
    const outcome = await this.repository.search({
      organizationId: session.organizationId,
      userId: session.userId,
      q: input.q,
      projectId: input.projectId,
      linkedProjectIds: await access.linkedProjectIds(session),
      includeFeatures: !isProjectScoped(session.role),
      limit: SEARCH_RESULTS_MAX,
    });
    return { ...outcome, nextCursor: null, previousCursor: null, offset: 0 };
  }
}
