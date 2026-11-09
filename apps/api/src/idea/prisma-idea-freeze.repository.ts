import { ideaVersionTag } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { isUniqueViolation } from "../tracker/api-errors.ts";
import { ProjectTransactions } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { IdeaSynthesisRecord } from "./idea.repository.ts";
import type {
  AllocatedVersion,
  FrozenLot,
  IdeaFreezeRepository,
} from "./idea-freeze.repository.ts";
import { reconcileIdeaVersions } from "./idea-publications.ts";
import { audit } from "./prisma-idea-helpers.ts";

const conflict = (batchId?: string | null) =>
  new ORPCError("SPEC_BATCH_CONFLICT", {
    data: { reason: "write_conflict", ...(batchId ? { batchId } : {}) },
  });

@Injectable()
export class PrismaIdeaFreezeRepository implements IdeaFreezeRepository {
  constructor(@Inject(ProjectTransactions) private readonly transactions: ProjectTransactions) {}

  byKey(scope: ProjectScope, idempotencyKey: string): Promise<FrozenLot | null> {
    return this.transactions.run(scope, async (tx) => {
      const batch = await tx.specWriteBatch.findFirst({
        where: { projectId: scope.projectId, idempotencyKey },
        select: { id: true, operations: { select: { kind: true } } },
      });
      if (batch === null) return null;
      const version = await tx.ideaVersion.findFirst({
        where: { projectId: scope.projectId, batchId: batch.id },
        select: { tag: true },
      });
      if (version === null) return null;
      return {
        batchId: batch.id,
        tag: version.tag,
        hasSynthesis: batch.operations.some(
          (operation) => operation.kind === "idea.synthesis.write",
        ),
      };
    });
  }

  async allocate(
    scope: ProjectScope,
    input: { pagesVersions: Record<string, number>; now: Date },
  ): Promise<AllocatedVersion> {
    try {
      return await this.transactions.run(scope, async (tx) => {
        await reconcileIdeaVersions(tx, scope, input.now);
        const inFlight = await tx.ideaVersion.findFirst({
          where: { projectId: scope.projectId, commitSha: null },
          select: { batchId: true },
        });
        if (inFlight !== null) throw conflict(inFlight.batchId);
        const last = await tx.ideaVersion.aggregate({
          where: { projectId: scope.projectId },
          _max: { number: true },
        });
        const number = (last._max.number ?? 0) + 1;
        const tag = ideaVersionTag(number);
        const row = await tx.ideaVersion.create({
          data: {
            organizationId: scope.organizationId,
            projectId: scope.projectId,
            number,
            tag,
            pagesVersions: input.pagesVersions,
            frozenBy: scope.userId,
            frozenAt: input.now,
          },
          select: { id: true },
        });
        return { id: row.id, number, tag };
      });
    } catch (error) {
      // Course entre deux passages sur le même numéro : l'unicité a tranché, le second perd.
      throw isUniqueViolation(error) ? conflict() : error;
    }
  }

  attach(
    scope: ProjectScope,
    input: { versionId: string; batchId: string; synthesis: IdeaSynthesisRecord | null },
  ): Promise<void> {
    return this.transactions.run(scope, async (tx) => {
      await tx.ideaVersion.update({
        where: { id: input.versionId },
        data: { batchId: input.batchId },
      });
      if (input.synthesis !== null) {
        const data = {
          contentMd: input.synthesis.contentMd,
          source: input.synthesis.source,
          generatedAt: input.synthesis.generatedAt,
        };
        await tx.ideaSynthesis.upsert({
          where: { projectId: scope.projectId },
          create: { organizationId: scope.organizationId, projectId: scope.projectId, ...data },
          update: data,
        });
      }
      await audit(tx, scope, "idea.freeze", scope.projectId, "project");
    });
  }

  async release(scope: ProjectScope, versionId: string): Promise<void> {
    await this.transactions.run(scope, (tx) =>
      tx.ideaVersion.deleteMany({
        where: { id: versionId, projectId: scope.projectId, commitSha: null },
      }),
    );
  }
}
