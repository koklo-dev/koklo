import type { PgBoss } from "pg-boss";

const LIVE_STATES: ReadonlySet<string> = new Set(["created", "retry", "active"]);

export interface Orphan {
  readonly queue: string;
  /** Champ de la charge qui porte l'identifiant de la ligne (`deliveryId`, `batchId`). */
  readonly field: "deliveryId" | "batchId";
  readonly rowId: string;
  readonly singletonKey: string;
}

/**
 * Ré-enfile une ligne orpheline. Un job vivant (en file, en reprise ou en cours) porte déjà la
 * ligne : on n'y touche pas. Sinon on supprime les jobs `failed` de la clé (ils bloquent la file
 * `key_strict_fifo`) puis on enfile un job de NOUVEL id, même clé, même charge minimale. Les
 * handlers sont idempotents : un doublon éventuel est sans effet.
 */
export async function requeueOrphan(boss: PgBoss, orphan: Orphan): Promise<"requeued" | "skipped"> {
  const own = await boss.findJobs(orphan.queue, { data: { [orphan.field]: orphan.rowId } });
  if (own.some((job) => LIVE_STATES.has(job.state))) return "skipped";
  const onKey = await boss.findJobs(orphan.queue, { key: orphan.singletonKey });
  const failed = onKey.filter((job) => job.state === "failed").map((job) => job.id);
  if (failed.length > 0) await boss.deleteJob(orphan.queue, failed);
  const id = await boss.send(
    orphan.queue,
    { [orphan.field]: orphan.rowId },
    { singletonKey: orphan.singletonKey },
  );
  return id === null ? "skipped" : "requeued";
}
