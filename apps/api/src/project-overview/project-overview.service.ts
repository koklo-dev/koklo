import type { ActivityItem, ProjectOverview } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_ROLES } from "../auth/roles.ts";
import { CLOCK, type Clock } from "../clock.ts";
import { DEFAULT_PAGE_SIZE } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { activityItemOf } from "./overview-activity.ts";
import { buildOverview } from "./overview-build.ts";
import {
  type Audience,
  PROJECT_OVERVIEW_REPOSITORY,
  type ProjectOverviewRepository,
} from "./project-overview.repository.ts";

/** Rôles d'équipe ; tout autre rôle, absent ou inconnu compris, reçoit la vue du client (fail-closed). */
const TEAM_ROLES: readonly string[] = ["owner", "admin", "dev", "designer"];
export const audienceOf = (role: string | undefined): Audience =>
  role !== undefined && TEAM_ROLES.includes(role) ? "team" : "client";

@Injectable()
export class ProjectOverviewService {
  constructor(
    @Inject(PROJECT_OVERVIEW_REPOSITORY) private readonly repository: ProjectOverviewRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async overview(scope: ProjectScope, role: string | undefined): Promise<ProjectOverview> {
    const audience = audienceOf(role);
    const now = new Date(this.clock.now());
    const withAi = audience === "team" && MANAGER_ROLES.some((manager) => manager === role);
    const record = await this.repository.overview(scope, { audience, now, withAi });
    return buildOverview(record, { role: role ?? "", audience, now });
  }

  async activity(
    scope: ProjectScope,
    role: string | undefined,
    query: { cursor?: string | undefined; limit?: number | undefined },
  ) {
    const page = await this.repository.activity(scope, audienceOf(role), {
      cursor: query.cursor,
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
    });
    const items: ActivityItem[] = page.rows.map(activityItemOf);
    return {
      items,
      nextCursor: page.nextCursor,
      previousCursor: null,
      offset: page.offset,
      total: page.total,
    };
  }
}
