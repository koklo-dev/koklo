import { Injectable } from "@nestjs/common";
import { PgBossProducer } from "../queue/pg-boss-producer.ts";

/** File consommée par le worker (même nom que `SEND_MAGIC_LINK_QUEUE` côté worker). */
export const SEND_MAGIC_LINK_QUEUE = "send-magic-link";

export interface MagicLinkJob {
  readonly email: string;
  readonly url: string;
}

/** Ce que `createAuth` attend pour remettre un lien : enfiler, jamais envoyer. */
export type EnqueueMagicLink = (job: MagicLinkJob) => Promise<void>;

/** Dépose `{ email, url }` dans la file du worker ; le payload porte le jeton. */
@Injectable()
export class MagicLinkQueue extends PgBossProducer {
  readonly enqueue: EnqueueMagicLink = (job) =>
    this.send(SEND_MAGIC_LINK_QUEUE, { email: job.email, url: job.url });
}
