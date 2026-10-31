import { withOrganization } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import { carrierFilter } from "../repo/prisma-repo.repository.ts";
import { isUniqueViolation, orNotFound } from "../tracker/api-errors.ts";
import { recordAudit } from "../tracker/audit.ts";
import { nextCounterValue } from "../tracker/counters.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { sameContent } from "./batch-content.ts";
import type {
  BatchRecord,
  CreateOutcome,
  PreparedBatch,
  SpecBatchPlan,
  SpecBatchRepository,
} from "./spec-batch.repository.ts";

const WITH_OPERATIONS = { operations: { orderBy: { position: "asc" as const } } };

const featureId = (value: number): string => `F-${String(value).padStart(3, "0")}`;

interface Row {
  id: string;
  repoId: string;
  branch: string;
  status: BatchRecord["status"];
  idempotencyKey: string;
  baseSha: string | null;
  commitSha: string | null;
  errorCode: string | null;
  report: unknown;
  message: string | null;
  enqueuedAt: Date;
  committedAt: Date | null;
  operations: { position: number; kind: string; targetSpecId: string | null; payload: unknown }[];
}

const recordOf = (row: Row): BatchRecord => ({
  id: row.id,
  repoId: row.repoId,
  branch: row.branch,
  status: row.status,
  idempotencyKey: row.idempotencyKey,
  baseSha: row.baseSha,
  commitSha: row.commitSha,
  errorCode: row.errorCode,
  report: row.report,
  message: row.message,
  enqueuedAt: row.enqueuedAt,
  committedAt: row.committedAt,
  operations: row.operations.map((operation) => ({
    position: operation.position,
    kind: operation.kind,
    specId: operation.targetSpecId,
    payload: operation.payload,
  })),
});

@Injectable()
export class PrismaSpecBatchRepository implements SpecBatchRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  plan(scope: ProjectScope): Promise<SpecBatchPlan> {
    return this.transactions.run(scope, async (tx) => {
      const repo = orNotFound(
        await tx.projectRepo.findFirst({
          where: { projectId: scope.projectId, ...carrierFilter },
          select: { id: true, defaultBranch: true },
        }),
      );
      return { repoId: repo.id, defaultBranch: repo.defaultBranch };
    });
  }

  async create(
    scope: ProjectScope,
    role: string,
    plan: SpecBatchPlan,
    batch: PreparedBatch,
  ): Promise<CreateOutcome> {
    try {
      return await this.transactions.run(scope, async (tx) => {
        const known = await this.known(tx, scope, batch);
        return known ?? { kind: "created", batch: await this.insert(tx, scope, role, plan, batch) };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Course entre deux soumissions de la même clé : l'unicité a tranché, on relit le gagnant.
      const known = await this.transactions.run(scope, (tx) => this.known(tx, scope, batch));
      if (!known) throw error;
      return known;
    }
  }

  find(scope: ProjectScope, batchId: string): Promise<BatchRecord | null> {
    return this.transactions.run(scope, async (tx) => {
      const row = await tx.specWriteBatch.findFirst({
        where: { id: batchId, projectId: scope.projectId },
        include: WITH_OPERATIONS,
      });
      return row ? recordOf(row) : null;
    });
  }

  poll(scope: ProjectScope, batchId: string): Promise<BatchRecord | null> {
    return withOrganization(scope.organizationId, async () => {
      const row = await this.database.client.specWriteBatch.findFirst({
        where: { id: batchId, projectId: scope.projectId },
        include: WITH_OPERATIONS,
      });
      return row ? recordOf(row) : null;
    });
  }

  /** Le lot déjà enregistré sous cette clé : rejeu à l'identique, ou clé réutilisée avec un autre contenu. */
  private async known(
    tx: Tx,
    scope: ProjectScope,
    batch: PreparedBatch,
  ): Promise<CreateOutcome | null> {
    const row = await tx.specWriteBatch.findFirst({
      where: { projectId: scope.projectId, idempotencyKey: batch.idempotencyKey },
      include: WITH_OPERATIONS,
    });
    if (!row) return null;
    const record = recordOf(row);
    return sameContent(record, batch)
      ? { kind: "replayed", batch: record }
      : { kind: "reused", batchId: record.id };
  }

  /** Lot, opérations, F-nnn des créations (compteur du projet) et audit : tout ou rien. */
  private async insert(
    tx: Tx,
    scope: ProjectScope,
    role: string,
    plan: SpecBatchPlan,
    batch: PreparedBatch,
  ): Promise<BatchRecord> {
    const { organizationId, projectId, userId } = scope;
    const row = await tx.specWriteBatch.create({
      data: {
        organizationId,
        projectId,
        repoId: plan.repoId,
        branch: batch.branch,
        authorUserId: userId,
        authorRole: role,
        idempotencyKey: batch.idempotencyKey,
        baseSha: batch.baseSha,
        message: batch.message,
        status: "queued",
      },
    });
    const operations = [];
    for (const [index, operation] of batch.operations.entries()) {
      const targetSpecId =
        operation.specId ?? featureId(await nextCounterValue(tx, scope, "feature"));
      operations.push({
        organizationId,
        batchId: row.id,
        position: index + 1,
        kind: operation.kind,
        targetSpecId,
        payload: operation.payload as object,
      });
    }
    await tx.specWriteOperation.createMany({ data: operations });
    await recordAudit(tx, scope, {
      action: "spec.batch.submit",
      targetKind: "spec_batch",
      targetId: row.id,
    });
    return recordOf({ ...row, operations });
  }
}
