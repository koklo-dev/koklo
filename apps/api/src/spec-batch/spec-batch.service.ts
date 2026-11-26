import type { SpecBatchOutput, SpecBatchSubmitInput } from "@koklo/contract";
import { specPathIndex } from "@koklo/schema";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type { AppConfig } from "../config.ts";
import { APP_CONFIG } from "../database/database.module.ts";
import { GitAccess } from "../repo/git-access.ts";
import { GIT_PROVIDER, type GitProviderBinding } from "../repo/tokens.ts";
import { orNotFound } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { replayedSubset } from "./batch-content.ts";
import {
  type BatchRecord,
  type PreparedBatch,
  SPEC_BATCH_REPOSITORY,
  type SpecBatchPlan,
  type SpecBatchRepository,
} from "./spec-batch.repository.ts";
import { prepareBatch } from "./spec-batch-input.ts";
import {
  allSkipped,
  failureOf,
  isOpen,
  outputOf,
  reusedKey,
  skippedOf,
} from "./spec-batch-output.ts";
import { type Precheck, precheckBatch } from "./spec-batch-precheck.ts";
import { specHeadPaths } from "./spec-head-paths.ts";
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
    @Inject(GitAccess) private readonly access: GitAccess,
  ) {}

  async submit(
    scope: ProjectScope,
    role: string,
    input: SpecBatchSubmitInput,
  ): Promise<SpecBatchOutput> {
    const proposals = input.skipConflicts?.proposals;
    if (proposals === undefined) {
      return this.commitPrepared(scope, role, (plan) => prepareBatch(input, plan.defaultBranch));
    }
    const prepared = prepareBatch(input, (await this.planned(scope)).defaultBranch);
    const known = await this.repository.findByKey(scope, prepared.idempotencyKey);
    if (known) return this.commitPrepared(scope, role, () => replayedSubset(known, prepared));
    return this.submitChecked(
      scope,
      role,
      prepared,
      await this.precheck(scope, prepared, proposals),
    );
  }

  /**
   * Enregistrement pré-vérifié (TK-114e, B671, B672) : seules les propositions sans conflit partent, les écartées sont remises
   * à relire ou, déjà présentes dans la spec, rejetées (TK-114g, B698), dans la transaction du lot, et rendues dans `skipped`.
   * Tout écarté : aucun lot, 409 `write_conflict`, mêmes écritures.
   */
  private async submitChecked(
    scope: ProjectScope,
    role: string,
    prepared: PreparedBatch,
    checked: Precheck,
  ): Promise<SpecBatchOutput> {
    const present = checked.alreadyPresentProposalIds;
    const returned = [
      ...new Set(
        checked.skipped.map((skipped) => skipped.proposalId).filter((id) => !present.includes(id)),
      ),
    ];
    if (checked.kept.length === 0) {
      await this.repository.returnToReview(scope, returned, present);
      throw allSkipped(checked.skipped);
    }
    const output = await this.commitPrepared(scope, role, () => ({
      ...prepared,
      operations: checked.kept,
      proposalIds: checked.keptProposalIds,
      returnedProposalIds: returned,
      presentProposalIds: present,
    }));
    return checked.skipped.length === 0
      ? output
      : { ...output, skipped: skippedOf(checked.skipped) };
  }

  /** Index par chemins de la branche du lot, lu hors transaction ; branche absente : rien n'est écarté. */
  private async precheck(
    scope: ProjectScope,
    prepared: PreparedBatch,
    proposals: readonly string[],
  ): Promise<Precheck> {
    const target = await this.repository.gitTarget(scope);
    const paths = await specHeadPaths(this.provider, this.access, target, prepared.branch);
    if (paths === null) {
      const keptProposalIds = [...new Set(proposals)];
      return {
        kept: prepared.operations,
        keptProposalIds,
        skipped: [],
        alreadyPresentProposalIds: [],
      };
    }
    return precheckBatch(prepared.operations, proposals, specPathIndex(paths));
  }

  /**
   * Enregistre un lot déjà préparé par un autre module (sans passer par `SpecBatchSubmitInput`), l'enfile, puis attend au plus
   * `SPEC_BATCH_WAIT_MS` que le worker le règle (positions du diagramme, TK-108). Mêmes refus et mêmes erreurs que `submit`.
   */
  async commitPrepared(
    scope: ProjectScope,
    role: string,
    build: (plan: SpecBatchPlan) => PreparedBatch,
  ): Promise<SpecBatchOutput> {
    const created = await this.register(scope, role, build);
    const settled = await this.settle(scope, created);
    if (settled.status === "failed" || settled.status === "conflict") throw failureOf(settled);
    return outputOf(settled);
  }

  /**
   * Enregistre et enfile un lot déjà préparé par un autre module (publication de l'espace Idée, TK-89),
   * sans attendre le worker : l'appelant suit le lot par `get`. Mêmes refus que `submit` (dépôt de spec,
   * fournisseur, clé d'idempotence réutilisée) ; rend l'identifiant du lot.
   */
  async enqueuePrepared(
    scope: ProjectScope,
    role: string,
    build: (plan: SpecBatchPlan) => PreparedBatch,
  ): Promise<string> {
    const batch = await this.register(scope, role, build);
    if (isOpen(batch.status)) await this.queue.enqueue(batch);
    return batch.id;
  }

  /**
   * Refus d'avant-lot (dépôt de spec absent : `NOT_FOUND` ; aucun fournisseur : `PROVIDER_UNAVAILABLE`), sans rien
   * écrire : permet de s'arrêter avant un appel coûteux (la Synthèse du passage au cadrage, TK-91).
   */
  async ensureWritable(scope: ProjectScope): Promise<void> {
    await this.planned(scope);
  }

  private async planned(scope: ProjectScope): Promise<SpecBatchPlan> {
    const plan = await this.repository.plan(scope);
    if (this.provider === null) throw new ORPCError("PROVIDER_UNAVAILABLE");
    return plan;
  }

  /** Dépôt de spec, fournisseur, puis lot enregistré (une transaction) ; une clé réutilisée est refusée. */
  private async register(
    scope: ProjectScope,
    role: string,
    build: (plan: SpecBatchPlan) => PreparedBatch,
  ): Promise<BatchRecord> {
    const plan = await this.planned(scope);
    const created = await this.repository.create(scope, role, plan, build(plan));
    if (created.kind === "reused") throw reusedKey(created.batchId);
    return created.batch;
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
