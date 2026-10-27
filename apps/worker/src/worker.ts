import { PgBoss } from "pg-boss";
import type { WorkerConfig } from "./config.ts";
import { handleNoop, NOOP_QUEUE } from "./jobs/noop.ts";

export type Worker = { readonly boss: PgBoss; stop(): Promise<void> };

/** Démarre pg-boss sur la base partagée, crée les files et enregistre un consommateur par job. */
export async function startWorker(config: WorkerConfig): Promise<Worker> {
  const boss = new PgBoss(config.databaseUrl);
  boss.on("error", (error) => console.error("pg-boss error", error));
  await boss.start();
  await boss.createQueue(NOOP_QUEUE);
  await boss.work(NOOP_QUEUE, async () => handleNoop());
  return { boss, stop: () => boss.stop() };
}
