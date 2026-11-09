import { Inject, Injectable } from "@nestjs/common";
import { ProjectTransactions } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { IdeaSynthesisRecord } from "./idea.repository.ts";
import { reconcileIdeaVersions } from "./idea-publications.ts";
import type { IdeaSynthesisRepository } from "./idea-synthesis.repository.ts";

@Injectable()
export class PrismaIdeaSynthesisRepository implements IdeaSynthesisRepository {
  constructor(@Inject(ProjectTransactions) private readonly transactions: ProjectTransactions) {}

  get(scope: ProjectScope): Promise<IdeaSynthesisRecord | null> {
    return this.transactions.run(scope, (tx) =>
      tx.ideaSynthesis.findUnique({
        where: { projectId: scope.projectId },
        select: { contentMd: true, source: true, generatedAt: true },
      }),
    );
  }

  latestTag(scope: ProjectScope): Promise<string | null> {
    return this.transactions.run(scope, async (tx) => {
      await reconcileIdeaVersions(tx, scope, new Date());
      const latest = await tx.ideaVersion.findFirst({
        where: { projectId: scope.projectId, commitSha: { not: null } },
        orderBy: { number: "desc" },
        select: { tag: true },
      });
      return latest?.tag ?? null;
    });
  }

  async save(scope: ProjectScope, record: IdeaSynthesisRecord): Promise<void> {
    await this.transactions.run(scope, (tx) =>
      tx.ideaSynthesis.upsert({
        where: { projectId: scope.projectId },
        create: { organizationId: scope.organizationId, projectId: scope.projectId, ...record },
        update: { ...record },
      }),
    );
  }
}
