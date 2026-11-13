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
import { DATA_PROPOSAL_ROLES } from "../auth/roles.ts";
import { CLOCK, type Clock } from "../clock.ts";
import { AgentProposeQueue } from "../queue/agent-propose-queue.ts";
import { SpecDeliverablesService } from "../spec-deliverables/spec-deliverables.service.ts";
import { forbidden, validation } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { LAUNCH_REPOSITORY, type LaunchRepository, type NewLaunch } from "./launch.repository.ts";

/** Livrables branchés : le Fonctionnel (TK-99a) et les Données (TK-107) ; les cinq autres sont refusés (TK-100). */
const WIRED_DELIVERABLES: readonly string[] = ["functional", "data"];
/** Modes des Données : « Proposer les mises à jour » viendra avec l'impact amont (TK-109, B387). */
const DATA_MODES: readonly string[] = ["complete", "all"];

/** « L'agent lit », avec le libellé de la modale ; les identifiants sont ceux du domaine. */
const READ_LABELS: Record<string, string> = {
  "idea.frozen": "Dossier d'idée figé",
  "idea.synthesis": "Synthèse",
  "idea.risks": "Hypothèses et risques",
  "functional.current": "Cahier fonctionnel actuel",
  "functional.features": "Cahier fonctionnel",
  "functional.rules": "Règles",
  "functional.roles": "Rôles",
  "functional.flows": "Parcours",
  "data.current": "Modèle actuel",
};
const readsOf = (ids: readonly string[]) => ids.map((id) => ({ id, label: READ_LABELS[id] ?? id }));

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
    @Inject(SpecDeliverablesService) private readonly deliverables: SpecDeliverablesService,
  ) {}

  async propose(
    scope: ProjectScope,
    input: AiProposeDeliverableInput,
    requestId: string,
    role: string | undefined,
  ): Promise<AiProposeDeliverableOutput> {
    if (!WIRED_DELIVERABLES.includes(input.deliverable)) {
      throw validation("deliverable", "Ce livrable n'est pas encore branché.");
    }
    const draft =
      input.deliverable === "data"
        ? await this.dataLaunch(scope, input, role)
        : await this.functionalLaunch(scope, input);
    const created = await this.launches.create(scope, draft, new Date(this.clock.now()));
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
    if (input.deliverable === "data") {
      return {
        options: [
          { ...option("complete"), recommended: true },
          { ...option("all"), recommended: false },
        ],
        reads: readsOf(AGENT_READS.data),
        available: true,
      };
    }
    if (input.deliverable !== "functional") {
      return { options: [], reads: [], available: false, reason: "not_wired" };
    }
    const reads = readsOf(AGENT_READS.functional);
    if ((await this.launches.frozenVersion(scope)) === null) {
      return { options: [], reads, available: false, reason: "no_frozen_idea" };
    }
    const facts = await this.launches.optionFacts(scope);
    const stale = await this.deliverables.staleBecause(scope, "functional");
    const listed = [
      option("complete"),
      ...(facts.withoutCriteria > 0 ? [option("criteria", facts.withoutCriteria)] : []),
      ...(stale && stale.changedPages > 0 ? [option("update", stale.changedPages)] : []),
      option("all"),
    ];
    return {
      options: listed.map((item, index) => ({ ...item, recommended: index === 0 })),
      reads,
      available: true,
    };
  }

  /** Fonctionnel : une version `idea-vN` figée est exigée ; le mode `update` exige des changements à reporter. */
  private async functionalLaunch(
    scope: ProjectScope,
    input: AiProposeDeliverableInput,
  ): Promise<NewLaunch> {
    const baseVersion = await this.launches.frozenVersion(scope);
    if (baseVersion === null) {
      throw validation(
        "deliverable",
        "Aucune version figée du dossier d'idée : figez-la avant de proposer.",
      );
    }
    if (input.mode === "update" && !(await this.deliverables.staleBecause(scope, "functional"))) {
      throw validation(
        "mode",
        "Aucun changement du dossier d'idée à reporter : rien à mettre à jour.",
      );
    }
    return {
      deliverable: input.deliverable,
      mode: input.mode,
      instruction: input.instruction ?? null,
      sources: AGENT_READS.functional,
      baseVersion,
    };
  }

  /** Données (B387) : rôles qui écrivent le modèle, modes `complete` et `all`, une entité du Fonctionnel, aucune version d'idée. */
  private async dataLaunch(
    scope: ProjectScope,
    input: AiProposeDeliverableInput,
    role: string | undefined,
  ): Promise<NewLaunch> {
    if (!(DATA_PROPOSAL_ROLES as readonly (string | undefined)[]).includes(role)) {
      throw forbidden();
    }
    if (!DATA_MODES.includes(input.mode)) {
      throw validation("mode", "Ce mode n'existe pas pour les Données.");
    }
    if (!(await this.launches.hasFunctionalEntities(scope))) {
      throw validation(
        "deliverable",
        "Le cahier fonctionnel est vide : enregistrez-en au moins un élément avant de proposer le modèle.",
      );
    }
    return {
      deliverable: input.deliverable,
      mode: input.mode,
      instruction: input.instruction ?? null,
      sources: AGENT_READS.data,
      baseVersion: null,
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
