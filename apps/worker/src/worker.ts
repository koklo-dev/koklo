import type { LogDestination, Logger } from "@koklo/observability";
import { PgBoss } from "pg-boss";
import type { WorkerConfig } from "./config.ts";
import { handleNoop, NOOP_QUEUE } from "./jobs/noop.ts";
import {
  createSendInvitationHandler,
  SEND_INVITATION_QUEUE,
  SEND_INVITATION_RETENTION_SECONDS,
  SEND_INVITATION_RETRY_LIMIT,
} from "./jobs/send-invitation.ts";
import {
  createSendMagicLinkHandler,
  SEND_MAGIC_LINK_QUEUE,
  SEND_MAGIC_LINK_RETENTION_SECONDS,
  SEND_MAGIC_LINK_RETRY_LIMIT,
} from "./jobs/send-magic-link.ts";
import { createMailSender } from "./mail/create-mail-sender.ts";
import type { MailSender } from "./mail/mail-sender.ts";
import { instrumentJob, setupObservability } from "./observability.ts";

export type Worker = { readonly boss: PgBoss; stop(): Promise<void> };

export interface StartWorkerOptions {
  /** Défaut : l'adaptateur choisi par `config.mail`. Les tests y injectent la capture. */
  mailSender?: MailSender;
  /** Destination des journaux (défaut : stdout). */
  logStream?: LogDestination;
}

interface MailQueue {
  name: string;
  options: { retryLimit: number; deleteAfterSeconds: number; retentionSeconds: number };
  handler: (job: { id: string; data: unknown }) => Promise<void>;
}

const mailQueue = (
  name: string,
  retryLimit: number,
  retentionSeconds: number,
  handler: MailQueue["handler"],
): MailQueue => ({
  name,
  options: { retryLimit, deleteAfterSeconds: retentionSeconds, retentionSeconds },
  handler,
});

async function registerMailQueue(boss: PgBoss, logger: Logger, queue: MailQueue): Promise<void> {
  await boss.createQueue(queue.name, queue.options);
  // `createQueue` ne réécrit pas une file existante : les options restent celles du code.
  await boss.updateQueue(queue.name, queue.options);
  await boss.work(queue.name, instrumentJob(logger, queue.name, queue.handler));
}

/** Démarre pg-boss sur la base partagée, crée les files et enregistre un consommateur par job. */
export async function startWorker(
  config: WorkerConfig,
  options: StartWorkerOptions = {},
): Promise<Worker> {
  const logger = setupObservability(
    config,
    options.logStream ? { logStream: options.logStream } : {},
  );
  const mailSender = options.mailSender ?? createMailSender(config.mail);
  const boss = new PgBoss(config.databaseUrl);
  boss.on("error", (error) => logger.error({ err: error }, "pg-boss error"));
  await boss.start();
  await boss.createQueue(NOOP_QUEUE);
  await boss.work(NOOP_QUEUE, instrumentJob(logger, NOOP_QUEUE, handleNoop));
  await registerMailQueue(
    boss,
    logger,
    mailQueue(
      SEND_MAGIC_LINK_QUEUE,
      SEND_MAGIC_LINK_RETRY_LIMIT,
      SEND_MAGIC_LINK_RETENTION_SECONDS,
      createSendMagicLinkHandler(mailSender),
    ),
  );
  await registerMailQueue(
    boss,
    logger,
    mailQueue(
      SEND_INVITATION_QUEUE,
      SEND_INVITATION_RETRY_LIMIT,
      SEND_INVITATION_RETENTION_SECONDS,
      createSendInvitationHandler(mailSender),
    ),
  );
  logger.info("worker started");
  return { boss, stop: () => boss.stop() };
}
