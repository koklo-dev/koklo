import { PROJECT_CREATION_QUEUE, projectCreationSingletonKey } from "@koklo/domain";
import { Injectable } from "@nestjs/common";
import { PgBossProducer } from "./pg-boss-producer.ts";

/**
 * Dépose `{ creationId }` dans la file `project-creation` du worker (qui la crée). `id = creationId`
 * rend le ré-enfilage idempotent ; `singletonKey = creationId` empêche deux exécutions simultanées
 * d'une même création. Aucun secret, aucun nom de dépôt dans le payload (TK-93, B301).
 */
@Injectable()
export class ProjectCreationQueue extends PgBossProducer {
  enqueue(creation: { id: string }): Promise<void> {
    return this.send(
      PROJECT_CREATION_QUEUE,
      { creationId: creation.id },
      { id: creation.id, singletonKey: projectCreationSingletonKey(creation.id) },
    );
  }
}
