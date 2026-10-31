import { WEBHOOK_DELIVERY_QUEUE } from "@koklo/domain";
import { Injectable } from "@nestjs/common";
import { PgBossProducer } from "../queue/pg-boss-producer.ts";

/**
 * Dépose `{ deliveryId }` dans la file `webhook-delivery` du worker (qui la crée en `key_strict_fifo`).
 * `id` du job = id de la ligne (ré-enfilage idempotent) ; `singletonKey` sérialise une installation, ou
 * une branche d'un dépôt. Le payload ne porte que l'identifiant : ni charge, ni secret.
 */
@Injectable()
export class WebhookDeliveryQueue extends PgBossProducer {
  enqueue(deliveryId: string, singletonKey: string): Promise<void> {
    return this.send(WEBHOOK_DELIVERY_QUEUE, { deliveryId }, { id: deliveryId, singletonKey });
  }
}
