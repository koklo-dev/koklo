import type {
  AiProposeDeliverableInput,
  AiProposeDeliverableOutput,
  AiProposeOptionsInput,
  AiProposeOptionsOutput,
} from "@koklo/contract";
import { AGENT_READS, type FunctionalMode } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { AiCallRunner, correlationIdOf } from "../ai/ai-call.ts";
import { verifyPrompt } from "../ai/ai-prompts.ts";
import { CLOCK, type Clock } from "../clock.ts";
import { AgentProposeQueue } from "../queue/agent-propose-queue.ts";
import { validation } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { LAUNCH_REPOSITORY, type LaunchRepository } from "./launch.repository.ts";

/** Seul livrable branché dans TK-99a ; les six autres sont acceptés par le contrat, refusés ici (TK-100). */
const WIRED_DELIVERABLE = "functional";

/** « L'agent lit » du Fonctionnel, avec le libellé de la modale ; les identifiants sont ceux du domaine. */
const READ_LABELS: Record<(typeof AGENT_READS.functional)[number], string> = {
  "idea.frozen": "Dossier d'idée figé",
  "idea.synthesis": "Synthèse",
  "idea.risks": "Hypothèses et risques",
  "functional.current": "Cahier fonctionnel actuel",
};
const reads = () => AGENT_READS.functional.map((id) => ({ id, label: READ_LABELS[id] }));

type Option = AiProposeOptionsOutput["options"][number];
const option = (id: FunctionalMode, count?: number): Omit<Option, "recommended"> =>
  count === undefined ? { id } : { id, count };

/**
 * Lancement d'une génération de propositions. Rapide : le modèle n'est pas appelé ici. Ordre : livrable branché et
 * version `idea-vN` figée, verrou en base (409 si un lancement est actif), refus du moteur, quota et audit
 * (une ligne par lancement), enfilage pg-boss. Une admission refusée retire le lancement : le verrou est libéré.
 */
@Injectable()
export class ProposalLaunchService {
  constructor(
    @Inject(LAUNCH_REPOSITORY) private readonly launches: LaunchRepository,
    @Inject(AiCallRunner) private readonly runner: AiCallRunner,
    @Inject(AgentProposeQueue) private readonly queue: AgentProposeQueue,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async propose(
    scope: ProjectScope,
    input: AiProposeDeliverableInput,
    requestId: string,
  ): Promise<AiProposeDeliverableOutput> {
    if (input.deliverable !== WIRED_DELIVERABLE) {
      throw validation("deliverable", "Ce livrable n'est pas encore branché.");
    }
    const baseVersion = await this.launches.frozenVersion(scope);
    if (baseVersion === null) {
      throw validation(
        "deliverable",
        "Aucune version figée du dossier d'idée : figez-la avant de proposer.",
      );
    }
    const created = await this.launches.create(
      scope,
      {
        deliverable: input.deliverable,
        mode: input.mode,
        instruction: input.instruction ?? null,
        sources: AGENT_READS.functional,
        baseVersion,
      },
      new Date(this.clock.now()),
    );
    if (created.kind === "busy") {
      throw new ORPCError("PROPOSAL_IN_PROGRESS", { data: { launchId: created.launchId } });
    }
    const { launch } = created;
    await this.admitOrRelease(scope, launch.id, requestId);
    await this.enqueueOrFail(scope, launch.id);
    return { launchId: launch.id, status: "queued" };
  }

  async options(
    scope: ProjectScope,
    input: AiProposeOptionsInput,
  ): Promise<AiProposeOptionsOutput> {
    if (input.deliverable !== WIRED_DELIVERABLE) {
      return { options: [], reads: [], available: false, reason: "not_wired" };
    }
    if ((await this.launches.frozenVersion(scope)) === null) {
      return { options: [], reads: reads(), available: false, reason: "no_frozen_idea" };
    }
    const facts = await this.launches.optionFacts(scope, input.deliverable);
    const listed = [
      option("complete"),
      ...(facts.withoutCriteria > 0 ? [option("criteria", facts.withoutCriteria)] : []),
      ...(facts.changedPages > 0 ? [option("update", facts.changedPages)] : []),
      option("all"),
    ];
    return {
      options: listed.map((item, index) => ({ ...item, recommended: index === 0 })),
      reads: reads(),
      available: true,
    };
  }

  private async admitOrRelease(scope: ProjectScope, launchId: string, requestId: string) {
    try {
      await this.runner.admit({
        purpose: "proposal-admit",
        usage: "spec_deliverables",
        actor: { organizationId: scope.organizationId, userId: scope.userId },
        projectId: scope.projectId,
        correlationId: correlationIdOf(requestId),
        quota: "ai",
        entry: () => ({
          action: "ai.deliverable.propose",
          targetKind: "agent_launch",
          targetId: launchId,
        }),
        frame: verifyPrompt,
      });
    } catch (error) {
      await this.launches.discard(scope, launchId);
      throw error;
    }
  }

  private async enqueueOrFail(scope: ProjectScope, launchId: string) {
    try {
      await this.queue.enqueue({ id: launchId });
    } catch (error) {
      await this.launches.fail(scope, launchId, "enqueue_failed", new Date(this.clock.now()));
      throw error;
    }
  }
}
