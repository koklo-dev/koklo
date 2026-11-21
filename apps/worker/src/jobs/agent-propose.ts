import { AGENT_PROPOSE_LIMITS, type AiProvider } from "@koklo/domain";
import type { Logger } from "@koklo/observability";
import { AgentProposeFailure, errorCodeOf } from "../agent-propose/errors.ts";
import { type GenerateOutcome, generate } from "../agent-propose/generate.ts";
import { notifyIfAway } from "../agent-propose/notify.ts";
import type { LaunchContext, ProposeStore } from "../agent-propose/store.ts";
import {
  errorNameOf,
  isRecord,
  QUEUE_DEFAULTS,
  type QueueSettings,
  uuidFieldOf,
} from "../job-support.ts";

export { AGENT_PROPOSE_QUEUE, agentProposeSingletonKey } from "@koklo/domain";

/** Un essai de reprise seulement : un lancement qui reprend alors qu'il tourne déjà est perdu (`worker_lost`). */
export type AgentProposeSettings = QueueSettings & {
  /**
   * Durée de travail d'un segment (ms, B617) : 900 s d'expiration pg-boss − 240 s d'un appel en cours (bascule comprise) −
   * 60 s de marge. Au-delà, le segment passe le relais à un job de suite.
   */
  deadlineMs: number;
};
export const AGENT_PROPOSE_DEFAULTS: AgentProposeSettings = {
  ...QUEUE_DEFAULTS,
  retryLimit: 1,
  concurrency: 2,
  deadlineMs: 600_000,
};

export interface AgentProposeDeps {
  readonly store: ProposeStore;
  readonly ai: AiProvider;
  readonly logger: Logger;
  readonly deadlineMs: number;
  readonly now?: () => Date;
  /** Dépose le job de suite `{ launchId, segment }` (même `singletonKey` : un seul job à la fois par lancement). */
  readonly enqueue: (launchId: string, segment: number) => Promise<void>;
}

/** Segment d'un job de suite (1 à 7) ; `undefined` pour le premier job ; `null` : charge invalide, job ignoré. */
function segmentOf(data: unknown): number | undefined | null {
  const segment = isRecord(data) ? data.segment : undefined;
  if (segment === undefined) return undefined;
  const valid =
    typeof segment === "number" &&
    Number.isInteger(segment) &&
    segment >= 1 &&
    segment < AGENT_PROPOSE_LIMITS.segments;
  return valid ? segment : null;
}

/** Suite d'un segment : relais, arrêt de l'extérieur, délai épuisé, ou fin (notification si l'utilisateur est parti). */
async function settle(
  deps: AgentProposeDeps & { now: () => Date },
  launch: LaunchContext,
  segment: number,
  outcome: GenerateOutcome,
): Promise<void> {
  if (outcome === "handoff") {
    if (await deps.store.handoff(launch, segment)) await deps.enqueue(launch.id, segment + 1);
    else await deps.store.cancelled(launch);
    return;
  }
  if (outcome === "stopped") return deps.store.cancelled(launch);
  if (outcome === "deadline") return deps.store.fail(launch, "timeout", "deadline");
  await notifyIfAway(deps.store, launch, deps.now(), deps.logger);
  await deps.store.finish(launch, outcome);
}

/**
 * Génère les propositions d'un lancement, segment par segment (B617). Le lancement continue sans client : rien ne dépend
 * d'une requête HTTP. Un échec est enregistré (`failed` + code typé, sans texte du fournisseur) et ne relance pas le job :
 * la reprise est une nouvelle demande de l'utilisateur. Seules les pannes de base remontent à pg-boss. Le worker n'écrit
 * jamais dans la spec.
 */
export function createAgentProposeHandler(deps: AgentProposeDeps) {
  const run = { ...deps, now: deps.now ?? (() => new Date()) };
  return async (job: { id: string; data: unknown }): Promise<void> => {
    const launchId = uuidFieldOf(job.data, "launchId");
    const segment = segmentOf(job.data);
    if (launchId === undefined || segment === null) return;
    const claim = await deps.store.claim(launchId, segment);
    if (claim.kind === "lost") {
      await deps.store.fail(claim.launch, "worker_lost");
      return;
    }
    if (claim.kind !== "ready") return;
    const { launch, progress } = claim;
    try {
      const sources = await deps.store.sources(launch);
      if (sources === null) throw new AgentProposeFailure("no_frozen_version");
      const euOnly = await deps.store.euOnly(launch);
      const outcome = await generate(run, launch, sources, euOnly, progress);
      await settle(run, launch, progress.segment, outcome);
    } catch (error) {
      deps.logger.warn({ launchId, errorName: errorNameOf(error) }, "agent-propose: failed");
      await deps.store.fail(launch, errorCodeOf(error));
    }
  };
}
