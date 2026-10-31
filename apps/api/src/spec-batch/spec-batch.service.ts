import type { SpecBatchOutput, SpecBatchSubmitInput } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type { AppConfig } from "../config.ts";
import { APP_CONFIG } from "../database/database.module.ts";
import { GIT_PROVIDER, type GitProviderBinding } from "../repo/tokens.ts";
import { orNotFound } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  type BatchRecord,
  SPEC_BATCH_REPOSITORY,
  type SpecBatchRepository,
} from "./spec-batch.repository.ts";
import { prepareBatch } from "./spec-batch-input.ts";
import { failureOf, isOpen, outputOf, reusedKey } from "./spec-batch-output.ts";
import { SpecWriteQueue } from "./spec-write.queue.ts";
import { pollUntil, SPEC_BATCH_WAIT_DEFAULT_MS } from "./wait.ts";

/**
 * Lots d'écriture de la spec. `submit` n'écrit jamais chez le fournisseur : il enregistre le lot
 * (une transaction : lot, opérations, F-nnn, audit), l'enfile, puis attend au plus
 * `SPEC_BATCH_WAIT_MS` que le worker le règle ; passé ce délai il rend le lot en cours et le
 * client interroge `get`. Le réseau n'est jamais dans une transaction.
 */
@Injectable()
export class SpecBatchService {
  constructor(
    @Inject(SPEC_BATCH_REPOSITORY) private readonly repository: SpecBatchRepository,
    @Inject(GIT_PROVIDER) private readonly provider: GitProviderBinding,
    @Inject(SpecWriteQueue) private readonly queue: SpecWriteQueue,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async submit(
    scope: ProjectScope,
    role: string,
    input: SpecBatchSubmitInput,
  ): Promise<SpecBatchOutput> {
    const plan = await this.repository.plan(scope);
    if (this.provider === null) throw new ORPCError("PROVIDER_UNAVAILABLE");
    const created = await this.repository.create(
      scope,
      role,
      plan,
      prepareBatch(input, plan.defaultBranch),
    );
    if (created.kind === "reused") throw reusedKey(created.batchId);
    const settled = await this.settle(scope, created.batch);
    if (settled.status === "failed" || settled.status === "conflict") throw failureOf(settled);
    return outputOf(settled);
  }

  async get(scope: ProjectScope, batchId: string): Promise<SpecBatchOutput> {
    return outputOf(orNotFound(await this.repository.find(scope, batchId)));
  }

  /** Enfile un lot encore ouvert (idempotent : rejeu après un échec d'enfilage), puis attend son résultat. */
  private async settle(scope: ProjectScope, batch: BatchRecord): Promise<BatchRecord> {
    if (!isOpen(batch.status)) return batch;
    await this.queue.enqueue(batch);
    return pollUntil(
      batch,
      () => this.repository.poll(scope, batch.id),
      (current) => !isOpen(current.status),
      this.config.specBatchWaitMs ?? SPEC_BATCH_WAIT_DEFAULT_MS,
    );
  }
}
