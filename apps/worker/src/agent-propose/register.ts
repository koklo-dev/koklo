import type { AiProvider } from "@koklo/domain";
import type { Logger } from "@koklo/observability";
import type { PgBoss } from "pg-boss";
import {
  AGENT_PROPOSE_DEFAULTS,
  AGENT_PROPOSE_QUEUE,
  type AgentProposeSettings,
  createAgentProposeHandler,
} from "../jobs/agent-propose.ts";
import { instrumentJob } from "../observability.ts";
import type { AgentProposeStore } from "./store.ts";

/** Latence de prise d'un lancement : l'écran sonde toutes les 3 s. */
const POLLING_INTERVAL_SECONDS = 0.5;
/** Jusqu'à treize appels au modèle ; au-delà, pg-boss considère le job perdu (le battement du lancement le dit aussi). */
const EXPIRE_IN_SECONDS = 900;

/**
 * File `agent-propose` en `key_strict_fifo` : une seule exécution à la fois pour un même lancement (déposé avec
 * `singletonKey = launchId`), plusieurs lancements en parallèle. `retryLimit` 1 : la reprise d'un job perdu.
 */
export async function registerAgentPropose(
  boss: PgBoss,
  logger: Logger,
  deps: { store: AgentProposeStore; ai: AiProvider },
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
  const handler = createAgentProposeHandler({ ...deps, logger, deadlineMs: settings.deadlineMs });
  await boss.work(
    AGENT_PROPOSE_QUEUE,
    { localConcurrency: settings.concurrency, pollingIntervalSeconds: POLLING_INTERVAL_SECONDS },
    instrumentJob(logger, AGENT_PROPOSE_QUEUE, handler),
  );
}
