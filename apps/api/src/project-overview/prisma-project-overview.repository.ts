import { Inject, Injectable } from "@nestjs/common";
import { readPhaseFacts } from "../project/prisma-project-shell.repository.ts";
import { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import { ProjectTransactions } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { readActivity } from "./prisma-overview-activity.ts";
import {
  readAiConfigured,
  readBaselineDate,
  readIdea,
  readPeople,
  readSpec,
  readSprint,
} from "./prisma-overview-reads.ts";
import type {
  ActivityPage,
  Audience,
  OverviewQuery,
  OverviewRecord,
  ProjectOverviewRepository,
} from "./project-overview.repository.ts";

const PREVIEW_SIZE = 5;

/** Lecture seule : une transaction par procédure, aucune écriture hors réconciliation des versions de l'idée. */
@Injectable()
export class PrismaProjectOverviewRepository implements ProjectOverviewRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(SpecHeadResolver) private readonly resolver: SpecHeadResolver,
  ) {}

  overview(scope: ProjectScope, query: OverviewQuery): Promise<OverviewRecord> {
    return this.transactions.run(scope, async (tx) => {
      const project = await tx.project.findFirstOrThrow({
        where: { id: scope.projectId },
        select: { id: true, name: true, createdAt: true },
      });
      const phaseFacts = await readPhaseFacts(tx, this.resolver, scope);
      const people = await readPeople(tx, scope);
      const idea = await readIdea(tx, scope, people.clientIds, query.now);
      const { snapshotId, ...spec } = await readSpec(tx, this.resolver, scope);
      return {
        project,
        phaseFacts,
        baselineAt: await readBaselineDate(tx, scope),
        ...idea,
        clients: people.clients,
        staff: people.staff,
        ...spec,
        sprint: await readSprint(tx, scope),
        aiConfigured: query.withAi ? await readAiConfigured(tx) : null,
        activity: await readActivity(
          tx,
          scope,
          query.audience,
          { cursor: undefined, limit: PREVIEW_SIZE },
          snapshotId,
        ),
      };
    });
  }

  activity(
    scope: ProjectScope,
    audience: Audience,
    page: { cursor: string | undefined; limit: number },
  ): Promise<ActivityPage> {
    return this.transactions.run(scope, async (tx) => {
      const found = await this.resolver.resolve(tx, scope, {});
      return readActivity(tx, scope, audience, page, found?.snapshot.id ?? null);
    });
  }
}
