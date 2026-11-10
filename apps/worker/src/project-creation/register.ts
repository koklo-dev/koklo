import type { GitProvider } from "@koklo/domain";
import type { Logger } from "@koklo/observability";
import type { PgBoss } from "pg-boss";
import {
  createProjectCreationHandler,
  PROJECT_CREATION_DEFAULTS,
  PROJECT_CREATION_QUEUE,
  type ProjectCreationSettings,
} from "../jobs/project-creation.ts";
import { instrumentJob } from "../observability.ts";
import type { ProjectCreationStore } from "./store.ts";

/** Latence de prise d'une création : l'écran sonde toutes les 3 s. */
const POLLING_INTERVAL_SECONDS = 0.5;
/** Trois appels au fournisseur ; au-delà, pg-boss considère le job perdu. */
const EXPIRE_IN_SECONDS = 300;

/**
 * File `project-creation` en `singleton` par création : une seule exécution à la fois pour une même
 * création (déposée avec `singletonKey = creationId`), plusieurs créations en parallèle.
 */
export async function registerProjectCreation(
  boss: PgBoss,
  logger: Logger,
  deps: { store: ProjectCreationStore; provider: GitProvider | null },
  overrides: Partial<ProjectCreationSettings> = {},
): Promise<void> {
  const settings = { ...PROJECT_CREATION_DEFAULTS, ...overrides };
  const options = {
    retryLimit: settings.retryLimit,
    retryDelay: settings.retryDelaySeconds,
    retryBackoff: true,
    expireInSeconds: EXPIRE_IN_SECONDS,
  };
  await boss.createQueue(PROJECT_CREATION_QUEUE, { ...options, policy: "key_strict_fifo" });
  await boss.updateQueue(PROJECT_CREATION_QUEUE, options);
  const handler = createProjectCreationHandler({
    ...deps,
    logger,
    retryLimit: settings.retryLimit,
  });
  await boss.work(
    PROJECT_CREATION_QUEUE,
    { localConcurrency: settings.concurrency, pollingIntervalSeconds: POLLING_INTERVAL_SECONDS },
    instrumentJob(logger, PROJECT_CREATION_QUEUE, handler),
  );
}
