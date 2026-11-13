import type {
  SpecMigrationOutput,
  SpecMigrationRevertInput,
  SpecMigrationStartInput,
} from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { SpecBatchService } from "../spec-batch/spec-batch.service.ts";
import { branchOf } from "../spec-batch/spec-batch-input.ts";
import { validation } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { buildMigrationBatch } from "./migration-batch.ts";

/**
 * Migration du format de spec v1 vers v2 (TK-106) : enregistre le lot et rend son identifiant, sans attendre le worker
 * (le client suit `specBatch.get`). Le rôle (owner) est vérifié par la garde du contrôleur avant le projet.
 */
@Injectable()
export class SpecMigrationService {
  constructor(@Inject(SpecBatchService) private readonly batches: SpecBatchService) {}

  async start(
    scope: ProjectScope,
    role: string,
    input: SpecMigrationStartInput,
  ): Promise<SpecMigrationOutput> {
    const batchId = await this.batches.enqueuePrepared(scope, role, (plan) =>
      buildMigrationBatch(input.idempotencyKey, branchOf(input.branch, plan.defaultBranch), {
        kind: "spec.migrate",
        payload: {},
      }),
    );
    return { batchId };
  }

  /** Le lot visé doit être une migration commitée du projet (sinon 404 s'il est inconnu, 400 sur `migrationBatchId`). */
  async revert(
    scope: ProjectScope,
    role: string,
    input: SpecMigrationRevertInput,
  ): Promise<SpecMigrationOutput> {
    const target = await this.batches.get(scope, input.migrationBatchId);
    const migrated = target.status === "committed" && target.results[0]?.kind === "spec.migrate";
    if (!migrated) {
      throw validation(
        "migrationBatchId",
        "Le lot visé n'est pas une migration enregistrée de ce projet.",
      );
    }
    const batchId = await this.batches.enqueuePrepared(scope, role, () =>
      buildMigrationBatch(input.idempotencyKey, target.branch, {
        kind: "spec.migrate.revert",
        payload: { migrationBatchId: target.id },
      }),
    );
    return { batchId };
  }
}
