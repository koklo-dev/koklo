import {
  captureError,
  type LogDestination,
  type Logger,
  setupObservability as setupSdkAndLogger,
} from "@koklo/observability";
import type { WorkerConfig } from "./config.ts";
import { errorNameOf } from "./job-support.ts";

/** Code fermé d'une erreur (`TransientJobError`, Prisma `P....`), jamais son message. */
function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(code) ? code : undefined;
}

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

/** Capture et journalise l'échec ; `codeOnly` : nom et code seuls, jamais le contenu de l'erreur. */
function reportJobFailure(
  jobLogger: Logger,
  error: unknown,
  tags: { jobId: string; queue: string },
  codeOnly: boolean,
): void {
  if (!codeOnly) {
    captureError(error, tags);
    jobLogger.error({ err: error }, "job failed");
    return;
  }
  const code = codeOf(error);
  captureError(new Error(`${errorNameOf(error)}${code ? ` ${code}` : ""}`), tags);
  jobLogger.error({ error: errorNameOf(error), ...(code ? { code } : {}) }, "job failed");
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
  options: { codeOnly?: boolean } = {},
): (jobs: Job[]) => Promise<void> {
  return async (jobs) => {
    for (const job of jobs) {
      const jobLogger = logger.child({ jobId: job.id, queue });
      try {
        await handler(job);
        jobLogger.info("job completed");
      } catch (error) {
        reportJobFailure(jobLogger, error, { jobId: job.id, queue }, options.codeOnly === true);
        throw error;
      }
    }
  };
}
