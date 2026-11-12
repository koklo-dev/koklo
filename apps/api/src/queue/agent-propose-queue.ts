import { AGENT_PROPOSE_QUEUE, agentProposeSingletonKey } from "@koklo/domain";
import { Injectable } from "@nestjs/common";
import { PgBossProducer } from "./pg-boss-producer.ts";

/**
 * Dépose `{ launchId }` dans la file `agent-propose` du worker (qui la crée). `id = launchId` rend le ré-enfilage
 * idempotent ; `singletonKey = launchId` empêche deux exécutions simultanées d'un même lancement. Aucun secret,
 * aucune consigne, aucun texte du modèle dans le payload (TK-99a).
 */
@Injectable()
export class AgentProposeQueue extends PgBossProducer {
  enqueue(launch: { id: string }): Promise<void> {
    return this.send(
      AGENT_PROPOSE_QUEUE,
      { launchId: launch.id },
      { id: launch.id, singletonKey: agentProposeSingletonKey(launch.id) },
    );
  }
}
