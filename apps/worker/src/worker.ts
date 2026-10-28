import { PgBoss } from "pg-boss";
import type { WorkerConfig } from "./config.ts";
import { handleNoop, NOOP_QUEUE } from "./jobs/noop.ts";
import { instrumentJob, setupObservability } from "./observability.ts";

export type Worker = { readonly boss: PgBoss; stop(): Promise<void> };

/** Démarre pg-boss sur la base partagée, crée les files et enregistre un consommateur par job. */
export async function startWorker(config: WorkerConfig): Promise<Worker> {
  const logger = setupObservability(config);
  const boss = new PgBoss(config.databaseUrl);
  boss.on("error", (error) => logger.error({ err: error }, "pg-boss error"));
  await boss.start();
  await boss.createQueue(NOOP_QUEUE);
  await boss.work(NOOP_QUEUE, instrumentJob(logger, NOOP_QUEUE, handleNoop));
  logger.info("worker started");
  return { boss, stop: () => boss.stop() };
}
