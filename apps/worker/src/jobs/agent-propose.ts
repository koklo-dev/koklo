import { AGENT_PROPOSE_QUEUE, type AiProvider } from "@koklo/domain";
import type { Logger } from "@koklo/observability";
import { AgentProposeFailure, errorCodeOf } from "../agent-propose/errors.ts";
import { generate } from "../agent-propose/generate.ts";
import { notifyIfAway } from "../agent-propose/notify.ts";
import type { AgentProposeStore } from "../agent-propose/store.ts";
import { errorNameOf, QUEUE_DEFAULTS, type QueueSettings, uuidFieldOf } from "../job-support.ts";

export { AGENT_PROPOSE_QUEUE, agentProposeSingletonKey } from "@koklo/domain";

/** Un essai de reprise seulement : un lancement qui reprend alors qu'il tourne déjà est perdu (`worker_lost`). */
export type AgentProposeSettings = QueueSettings & {
  /** Durée maximale d'un lancement (ms), sous l'expiration pg-boss de 900 s. */
  deadlineMs: number;
};
export const AGENT_PROPOSE_DEFAULTS: AgentProposeSettings = {
  ...QUEUE_DEFAULTS,
  retryLimit: 1,
  concurrency: 2,
  deadlineMs: 840_000,
};

export interface AgentProposeDeps {
  readonly store: AgentProposeStore;
  readonly ai: AiProvider;
  readonly logger: Logger;
  readonly deadlineMs: number;
  readonly now?: () => Date;
}

/**
 * Génère les propositions d'un lancement. Le lancement continue sans client : rien ne dépend d'une requête HTTP.
 * Un échec est enregistré (`failed` + code typé, sans texte du fournisseur) et ne relance pas le job : la reprise
 * est une nouvelle demande de l'utilisateur. Seules les pannes de base remontent à pg-boss. Le worker n'écrit
 * jamais dans la spec.
 */
export function createAgentProposeHandler(deps: AgentProposeDeps) {
  const now = deps.now ?? (() => new Date());
  return async (job: { id: string; data: unknown }): Promise<void> => {
    const launchId = uuidFieldOf(job.data, "launchId");
    if (launchId === undefined) return;
    const claim = await deps.store.claim(launchId);
    if (claim.kind === "lost") {
      await deps.store.fail(claim.launch, "worker_lost");
      return;
    }
    if (claim.kind !== "ready") return;
    const { launch } = claim;
    try {
      const sources = await deps.store.sources(launch);
      if (sources === null) throw new AgentProposeFailure("no_frozen_version");
      const euOnly = await deps.store.euOnly(launch);
      const run = { store: deps.store, ai: deps.ai, deadlineMs: deps.deadlineMs, now };
      if (!(await generate(run, launch, sources, euOnly))) return;
      await notifyIfAway(deps.store, launch, now(), deps.logger);
      await deps.store.finish(launch);
    } catch (error) {
      deps.logger.warn({ launchId, errorName: errorNameOf(error) }, "agent-propose: failed");
      await deps.store.fail(launch, errorCodeOf(error));
    }
  };
}
