import type { Logger } from "@koklo/observability";
import { errorNameOf, QUEUE_DEFAULTS, type QueueSettings, uuidFieldOf } from "../job-support.ts";
import type { DeliveryStore } from "../webhook/delivery-store.ts";
import { classify, WebhookTransientError } from "../webhook/errors.ts";
import { handleInstallation, type InstallationDeps } from "../webhook/installation.ts";
import { parseDeliveryPayload } from "../webhook/payload.ts";
import { handlePush, type PushDeps } from "../webhook/push.ts";
import {
  type DeliveryOutcome,
  type DeliveryRow,
  errorCodeOf,
  failedWith,
  ignored,
  SETTLED_STATUSES,
} from "../webhook/types.ts";

export { WEBHOOK_DELIVERY_QUEUE } from "@koklo/domain";

/** Essais et concurrence de la file : des branches et des installations différentes progressent ensemble. */
export type WebhookDeliverySettings = QueueSettings;

export const WEBHOOK_DELIVERY_DEFAULTS: WebhookDeliverySettings = QUEUE_DEFAULTS;

/** Job reçu de pg-boss : `retryCount` compte les reprises déjà faites. */
export interface WebhookDeliveryJob {
  id: string;
  data: unknown;
  retryCount: number;
}

export interface WebhookDeliveryDeps extends PushDeps, InstallationDeps {
  readonly deliveries: DeliveryStore;
  readonly logger: Logger;
  readonly retryLimit: number;
}

/** Une exécution : résultat métier, ou exception si la panne est transitoire et pas au dernier essai. */
async function attempt(
  deps: WebhookDeliveryDeps,
  row: DeliveryRow,
  lastAttempt: boolean,
): Promise<DeliveryOutcome> {
  if (row.event !== "push" && row.event !== "installation") return ignored();
  const job = parseDeliveryPayload(row.event, row.payload);
  if (job === undefined) return failedWith("invalid_payload");
  try {
    return job.kind === "push"
      ? await handlePush(deps, job)
      : await handleInstallation(deps, job, row.id);
  } catch (error) {
    const failure = classify(error);
    if ("outcome" in failure) return failure.outcome;
    deps.logger.warn(
      { deliveryId: row.id, code: failure.retry, lastAttempt, errorName: errorNameOf(error) },
      "webhook-delivery: panne transitoire",
    );
    if (!lastAttempt) throw new WebhookTransientError(failure.retry);
    return failedWith(failure.retry);
  }
}

/**
 * Handler du job `{ deliveryId }`. Machine d'états : `received -> processing (essai + 1) ->
 * processed | ignored | failed`. Tout résultat métier est écrit sur la livraison et le job TERMINE
 * normalement : un job en échec bloquerait sa clé (`key_strict_fifo`). Seule une panne transitoire,
 * avant le dernier essai, relance. Une livraison absente (purgée) ou déjà réglée est sans effet.
 */
export function createWebhookDeliveryHandler(deps: WebhookDeliveryDeps) {
  return async (job: WebhookDeliveryJob): Promise<void> => {
    const deliveryId = uuidFieldOf(job.data, "deliveryId");
    if (deliveryId === undefined) {
      deps.logger.warn({ jobId: job.id }, "webhook-delivery: payload invalide, job ignoré");
      return;
    }
    const row = await deps.deliveries.load(deliveryId);
    if (!row || SETTLED_STATUSES.has(row.status)) return;
    if (!(await deps.deliveries.begin(row.id))) return;
    const outcome = await attempt(deps, row, job.retryCount >= deps.retryLimit);
    await deps.deliveries.settle(row.id, outcome);
    deps.logger.info(
      {
        deliveryId,
        event: row.event,
        status: outcome.status,
        errorCode: errorCodeOf(outcome),
      },
      "webhook-delivery: livraison réglée",
    );
  };
}
