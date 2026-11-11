import { PROPOSAL_NOTIFY_AFTER_MS } from "@koklo/domain";
import type { Logger } from "@koklo/observability";
import { errorNameOf } from "../job-support.ts";
import type { AgentProposeStore, LaunchContext } from "./store.ts";

/**
 * L'utilisateur est parti : la liste n'a pas été lue depuis plus de 30 secondes. Sans lecture du tout, on mesure
 * depuis le début du traitement (il n'a pas encore eu le temps de regarder).
 */
export function isAway(
  times: { lastSeenAt: Date | null; startedAt: Date | null },
  now: Date,
): boolean {
  const reference = times.lastSeenAt ?? times.startedAt;
  return reference !== null && now.getTime() - reference.getTime() > PROPOSAL_NOTIFY_AFTER_MS;
}

/**
 * À la fin d'un lancement : notifie le demandeur s'il est parti. Au mieux : le lancement est réussi, une
 * notification impossible (membre retiré, doublon) n'est qu'une ligne de journal par nom d'erreur.
 */
export async function notifyIfAway(
  store: AgentProposeStore,
  launch: LaunchContext,
  now: Date,
  logger: Logger,
): Promise<void> {
  try {
    if (isAway(await store.times(launch), now)) await store.notifyReady(launch);
  } catch (error) {
    logger.warn({ errorName: errorNameOf(error) }, "agent-propose: notification not created");
  }
}
