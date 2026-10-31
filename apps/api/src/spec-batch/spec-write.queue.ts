import { SPEC_WRITE_QUEUE, specWriteSingletonKey } from "@koklo/domain";
import { Injectable } from "@nestjs/common";
import { PgBossProducer } from "../queue/pg-boss-producer.ts";

/**
 * Dépose `{ batchId }` dans la file `spec-write` du worker (qui la crée en `key_strict_fifo`).
 * `id = batchId` rend le ré-enfilage idempotent (un second envoi du même lot est sans effet) ;
 * `singletonKey = repoId:branche` sérialise les lots d'une même branche. Aucun secret dans le payload.
 */
@Injectable()
export class SpecWriteQueue extends PgBossProducer {
  enqueue(batch: { id: string; repoId: string; branch: string }): Promise<void> {
    return this.send(
      SPEC_WRITE_QUEUE,
      { batchId: batch.id },
      { id: batch.id, singletonKey: specWriteSingletonKey(batch.repoId, batch.branch) },
    );
  }
}
