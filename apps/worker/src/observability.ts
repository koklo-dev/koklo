import {
  captureError,
  type LogDestination,
  type Logger,
  setupObservability as setupSdkAndLogger,
} from "@koklo/observability";
import type { WorkerConfig } from "./config.ts";

/** Initialise le SDK d'erreurs (si un DSN est fourni) et crée le logger JSON du worker. */
export function setupObservability(
  config: WorkerConfig,
  options: { logStream?: LogDestination } = {},
): Logger {
  return setupSdkAndLogger({
    dsn: config.sentryDsn,
    environment: config.appEnv,
    release: config.appVersion,
    level: config.logLevel,
    destination: options.logStream,
  });
}

/**
 * Enveloppe un handler pg-boss : logger enfant `{ jobId, queue }` par job. Une erreur est
 * capturée, journalisée puis relancée, pour que pg-boss marque le job échoué tandis que le
 * consommateur reste actif.
 */
export function instrumentJob<Job extends { id: string }>(
  logger: Logger,
  queue: string,
  handler: (job: Job) => Promise<unknown>,
): (jobs: Job[]) => Promise<void> {
  return async (jobs) => {
    for (const job of jobs) {
      const jobLogger = logger.child({ jobId: job.id, queue });
      try {
        await handler(job);
        jobLogger.info("job completed");
      } catch (error) {
        captureError(error, { jobId: job.id, queue });
        jobLogger.error({ err: error }, "job failed");
        throw error;
      }
    }
  };
}
