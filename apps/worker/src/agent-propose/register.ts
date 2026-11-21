import type { AiProvider } from "@koklo/domain";
import type { Logger } from "@koklo/observability";
import type { PgBoss } from "pg-boss";
import {
  AGENT_PROPOSE_DEFAULTS,
  AGENT_PROPOSE_QUEUE,
  type AgentProposeSettings,
  agentProposeSingletonKey,
  createAgentProposeHandler,
} from "../jobs/agent-propose.ts";
import { instrumentJob } from "../observability.ts";
import type { ProposeStore } from "./store.ts";

/** Latence de prise d'un lancement : l'écran sonde toutes les 3 s. */
const POLLING_INTERVAL_SECONDS = 0.5;
/**
 * Expiration d'un job (B617) : un segment travaille 600 s au plus (`deadlineMs`), plus un appel en cours (240 s avec la
 * bascule), sous ces 900 s. Au-delà, pg-boss considère le job perdu (le battement du lancement le dit aussi).
 */
const EXPIRE_IN_SECONDS = 900;

/**
 * File `agent-propose` en `key_strict_fifo` : une seule exécution à la fois pour un même lancement (déposé avec
 * `singletonKey = launchId`), plusieurs lancements en parallèle. `retryLimit` 1 : la reprise d'un job perdu.
 */
export async function registerAgentPropose(
  boss: PgBoss,
  logger: Logger,
  deps: { store: ProposeStore; ai: AiProvider },
  overrides: Partial<AgentProposeSettings> = {},
): Promise<void> {
  const settings = { ...AGENT_PROPOSE_DEFAULTS, ...overrides };
  const options = {
    retryLimit: settings.retryLimit,
    retryDelay: settings.retryDelaySeconds,
    retryBackoff: true,
    expireInSeconds: EXPIRE_IN_SECONDS,
  };
  await boss.createQueue(AGENT_PROPOSE_QUEUE, { ...options, policy: "key_strict_fifo" });
  await boss.updateQueue(AGENT_PROPOSE_QUEUE, options);
  /** Job de suite d'un lancement : `{ launchId, segment }` seul, même clé de singleton, identifiant neuf. */
  const enqueue = async (launchId: string, segment: number): Promise<void> => {
    const singletonKey = agentProposeSingletonKey(launchId);
    const id = await boss.send(AGENT_PROPOSE_QUEUE, { launchId, segment }, { singletonKey });
    if (id === null) throw new Error("job de suite refusé par la file");
  };
  const handler = createAgentProposeHandler({
    ...deps,
    logger,
    deadlineMs: settings.deadlineMs,
    enqueue,
  });
  await boss.work(
    AGENT_PROPOSE_QUEUE,
    { localConcurrency: settings.concurrency, pollingIntervalSeconds: POLLING_INTERVAL_SECONDS },
    instrumentJob(logger, AGENT_PROPOSE_QUEUE, handler),
  );
}
