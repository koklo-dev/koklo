import { Injectable } from "@nestjs/common";
import { PgBossProducer } from "../queue/pg-boss-producer.ts";

/** File consommée par le worker (même nom que `SEND_INVITATION_QUEUE` côté worker). */
export const SEND_INVITATION_QUEUE = "send-invitation";

export interface InvitationJob {
  readonly email: string;
  /** Lien d'acceptation : porte l'identifiant de l'invitation, jamais journalisé. */
  readonly url: string;
  readonly inviterName: string;
  readonly organizationName: string;
  readonly role: string;
}

/** Ce que `createAuth` attend pour remettre une invitation : enfiler, jamais envoyer. */
export type EnqueueInvitation = (job: InvitationJob) => Promise<void>;

@Injectable()
export class InvitationQueue extends PgBossProducer {
  readonly enqueue: EnqueueInvitation = (job) =>
    this.send(SEND_INVITATION_QUEUE, {
      email: job.email,
      url: job.url,
      inviterName: job.inviterName,
      organizationName: job.organizationName,
      role: job.role,
    });
}
