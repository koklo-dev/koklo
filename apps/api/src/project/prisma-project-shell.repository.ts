import { withOrganization } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import { reconcileIdeaVersions } from "../idea/idea-publications.ts";
import { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  ProjectShellRepository,
  RecentRequest,
  RecentVisit,
  ShellRecord,
} from "./project-shell.repository.ts";
import type { ShellFacts } from "./project-shell.ts";

const VALIDATED = ["validated", "tagged"] as const;

async function featureCount(tx: Tx, resolver: SpecHeadResolver, scope: ProjectScope) {
  const found = await resolver.resolve(tx, scope, {});
  return found ? tx.specFeature.count({ where: { snapshotId: found.snapshot.id } }) : 0;
}

async function activeSprintTickets(tx: Tx, projectId: string): Promise<number | null> {
  const sprint = await tx.sprint.findFirst({
    where: { projectId, status: "active" },
    select: { id: true },
  });
  if (!sprint) return null;
  return tx.ticket.count({ where: { projectId, sprintId: sprint.id, deletedAt: null } });
}

async function committedIdeaVersions(tx: Tx, scope: ProjectScope): Promise<number> {
  await reconcileIdeaVersions(tx, scope, new Date());
  return tx.ideaVersion.count({ where: { projectId: scope.projectId, commitSha: { not: null } } });
}

/**
 * Faits qui décident de la phase, lus une fois pour `project.shell`, `project.overview` et `clientSpace.projects`
 * (TK-92, B272). Le lot commité d'une version est réconcilié à la lecture : la phase suit le commit sans passer par la liste.
 */
export async function readPhaseFacts(
  tx: Tx,
  resolver: SpecHeadResolver,
  scope: ProjectScope,
): Promise<ShellFacts> {
  return {
    featureCount: await featureCount(tx, resolver, scope),
    validatedBaselines: await tx.baseline.count({
      where: { projectId: scope.projectId, status: { in: [...VALIDATED] } },
    }),
    ideaVersions: await committedIdeaVersions(tx, scope),
  };
}

@Injectable()
export class PrismaProjectShellRepository implements ProjectShellRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(SpecHeadResolver) private readonly resolver: SpecHeadResolver,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  shell(scope: ProjectScope): Promise<ShellRecord> {
    return this.transactions.run(scope, async (tx) => {
      const project = await tx.project.findFirstOrThrow({
        where: { id: scope.projectId },
        select: { id: true, name: true },
      });
      return {
        ...project,
        ...(await readPhaseFacts(tx, this.resolver, scope)),
        activeSprintTickets: await activeSprintTickets(tx, scope.projectId),
      };
    });
  }

  visit(scope: ProjectScope, at: Date): Promise<Date> {
    const { organizationId, projectId, userId } = scope;
    return this.transactions.run(scope, async (tx) => {
      const row = await tx.projectVisit.upsert({
        where: { projectId_userId: { projectId, userId }, organizationId },
        create: { organizationId, projectId, userId, visitedAt: at },
        update: { visitedAt: at },
        select: { visitedAt: true },
      });
      return row.visitedAt;
    });
  }

  recent({
    organizationId,
    userId,
    linkedProjectIds,
    limit,
  }: RecentRequest): Promise<RecentVisit[]> {
    if (linkedProjectIds?.length === 0) return Promise.resolve([]);
    return withOrganization(organizationId, async () => {
      const rows = await this.database.client.projectVisit.findMany({
        where: {
          userId,
          ...(linkedProjectIds ? { projectId: { in: [...linkedProjectIds] } } : {}),
        },
        orderBy: [{ visitedAt: "desc" }, { id: "desc" }],
        take: limit,
        select: { visitedAt: true, project: { select: { id: true, name: true } } },
      });
      return rows.map(({ visitedAt, project }) => ({ ...project, visitedAt }));
    });
  }
}
