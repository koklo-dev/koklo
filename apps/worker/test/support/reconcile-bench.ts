import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import { createPayload, SPEC_WRITE_QUEUE } from "./spec-write-bench.ts";
import { DELIVERY_QUEUE, WAIT_MS, type WebhookBench, type WebhookScene } from "./webhook-bench.ts";

/**
 * Aides des tests d'intégration de TK-46a (réconciliation périodique, passes P1 et P2).
 *
 * Contrat attendu de la production :
 *  - `RECONCILE_QUEUE = "reconcile"` (@koklo/domain), file ordinaire, job sans charge utile ;
 *  - `startWorker` crée la file, son consommateur et la planification `*\/10 * * * *` UTC ;
 *  - un tick = un job : le handler termine toujours normalement et journalise UNE ligne de bilan
 *    `{ deliveries: { requeued, skipped }, batches: { requeued, skipped }, failedPasses: string[],
 *    durationMs }`, ou `{ skipped: "already_running" }` quand le verrou consultatif est pris ;
 *  - orphelin = ligne non réglée plus vieille que la grâce, sans job pg-boss en created|retry|active
 *    portant son identifiant dans la charge (`deliveryId` / `batchId`) ;
 *  - réparation : suppression des jobs `failed` de la même clé, puis `boss.send` d'un job de NOUVEL
 *    id, même `singletonKey`, même charge minimale.
 */
export const RECONCILE_QUEUE = "reconcile";
export { DELIVERY_QUEUE, SPEC_WRITE_QUEUE };

const MINUTE = 60_000;
export const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * MINUTE);

export interface Summary {
  deliveries?: { requeued: number; skipped: number };
  batches?: { requeued: number; skipped: number };
  prs?: { done: number; closed: number; skipped: number; reasons?: Record<string, number> };
  heads?: {
    updated: number;
    removed: number;
    unreachable: number;
    skipped: number;
    stopped: "rate_limited" | "budget" | null;
  };
  failedPasses?: string[];
  skipped?: string;
  durationMs?: number;
}

export type JobRow = { id: string; state: string; singleton_key: string | null };

/**
 * Remet le banc à blanc : lignes, jobs des files concernées, journaux. `audit_log` est immuable
 * (trigger) : il n'est pas vidé, chaque scène a sa propre organisation et les tests filtrent dessus.
 */
export async function resetBench(bench: WebhookBench): Promise<void> {
  await bench.query("DELETE FROM spec_write_operations");
  await bench.query("DELETE FROM spec_write_batches");
  await bench.query("DELETE FROM webhook_deliveries");
  await bench.query("DELETE FROM pgboss.job WHERE name = ANY($1::text[])", [
    [DELIVERY_QUEUE, SPEC_WRITE_QUEUE, RECONCILE_QUEUE],
  ]);
  bench.lines.length = 0;
  bench.spy.reset();
}

/** Un tick de réconciliation : enfile le job, attend qu'il soit `completed`, rend le bilan journalisé. */
export async function runReconcile(bench: WebhookBench): Promise<Summary> {
  const before = bench.lines.length;
  let id: string | null = null;
  try {
    id = await bench.worker.boss.send(RECONCILE_QUEUE, {});
  } catch (error) {
    throw new Error(`file ${RECONCILE_QUEUE} absente : ${(error as Error).message}`);
  }
  if (id === null) throw new Error(`file ${RECONCILE_QUEUE} absente : send a rendu null`);
  await vi.waitFor(
    async () => {
      const job = await bench.worker.boss.getJobById(RECONCILE_QUEUE, id ?? "");
      if (job?.state !== "completed") throw new Error(`reconcile : ${job?.state}`);
    },
    { timeout: WAIT_MS, interval: 150 },
  );
  const summary = summaryIn(bench.lines.slice(before));
  if (!summary) throw new Error("aucune ligne de bilan de réconciliation dans les journaux");
  return summary;
}

export function summaryIn(lines: string[]): Summary | undefined {
  const parsed = lines.flatMap((line) => {
    try {
      return [JSON.parse(line) as Summary];
    } catch {
      return [];
    }
  });
  return parsed.reverse().find((entry) => entry.deliveries || entry.skipped === "already_running");
}

export async function jobsOf(
  bench: WebhookBench,
  queue: string,
  field: "deliveryId" | "batchId",
  id: string,
): Promise<JobRow[]> {
  return bench.query<JobRow>(
    "SELECT id, state::text AS state, singleton_key FROM pgboss.job WHERE name = $1 AND data->>$2 = $3 ORDER BY created_on, id",
    [queue, field, id],
  );
}

/** Force un job dans l'état `failed` (retries épuisés) : la clé `key_strict_fifo` est alors bloquée. */
export async function failJob(bench: WebhookBench, queue: string, jobId: string): Promise<void> {
  await bench.query(
    "UPDATE pgboss.job SET state = 'failed'::pgboss.job_state, completed_on = now() WHERE name = $1 AND id = $2",
    [queue, jobId],
  );
}

/** Ligne de livraison `push` normalisée, vieille de `ageMinutes`, SANS job. */
export async function orphanDelivery(
  bench: WebhookBench,
  scene: WebhookScene,
  over: { ageMinutes?: number; status?: string; branch?: string; canary?: string } = {},
): Promise<{ id: string; singletonKey: string }> {
  const branch = over.branch ?? "cadrage";
  const payload = bench.pushPayload(scene, { branch, ref: `refs/heads/${branch}` });
  const age = minutesAgo(over.ageMinutes ?? 20);
  const id = await bench.insertDelivery({
    event: "push",
    installationExternalId: payload.installationId,
    repoExternalId: payload.repositoryId,
    payload: { ...(payload as unknown as Record<string, unknown>), canary: over.canary },
    status: over.status ?? "received",
    receivedAt: age,
  });
  await bench.query(
    "UPDATE webhook_deliveries SET created_at = $2, updated_at = $2 WHERE id = $1",
    [id, age],
  );
  return { id, singletonKey: `push:${payload.repositoryId}:${payload.ref}` };
}

/** Lot `spec-write` vieux de `ageMinutes`, SANS job. Crée la feature F-001 sur la branche. */
export async function orphanBatch(
  bench: WebhookBench,
  scene: WebhookScene,
  over: {
    ageMinutes?: number;
    status?: "queued" | "committing";
    title?: string;
    message?: string;
  } = {},
): Promise<{ id: string; singletonKey: string }> {
  const id = await bench.inner.insertBatch(scene, {
    status: over.status ?? "queued",
    ...(over.message === undefined ? {} : { message: over.message }),
    operations: [
      {
        kind: "feature.create",
        specId: "F-001",
        payload: createPayload(over.title ?? "Orpheline"),
      },
    ],
  });
  const age = minutesAgo(over.ageMinutes ?? 20);
  await bench.query(
    "UPDATE spec_write_batches SET enqueued_at = $2, created_at = $2, updated_at = $2 WHERE id = $1",
    [id, age],
  );
  return { id, singletonKey: `${scene.repoId}:cadrage` };
}

/** Job vivant mais pas encore pris (démarrage différé d'une heure) : la ligne n'est PAS orpheline. */
export async function liveJob(
  bench: WebhookBench,
  queue: string,
  payload: Record<string, string>,
  singletonKey: string,
  id: string = randomUUID(),
): Promise<void> {
  await bench.worker.boss.send(queue, payload, { id, singletonKey, startAfter: 3600 });
}

/**
 * Précondition des tests de clé bloquée : tant qu'un job `failed` porte la clé d'une file
 * `key_strict_fifo`, un nouveau job de la même clé reste `created` (jamais pris). La sonde est
 * supprimée ensuite pour ne pas fausser le décompte des jobs de la ligne.
 */
export async function keyIsBlocked(
  bench: WebhookBench,
  queue: string,
  payload: Record<string, string>,
  singletonKey: string,
): Promise<boolean> {
  const probe = await bench.worker.boss.send(queue, payload, { singletonKey });
  if (probe === null) return true;
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const job = await bench.worker.boss.getJobById(queue, probe);
  await bench.worker.boss.deleteJob(queue, probe);
  return job?.state === "created";
}
