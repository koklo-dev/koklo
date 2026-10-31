import type { PrismaClient } from "@koklo/db";
import { withTenantIsolation } from "@koklo/db";
import type { GitProvider } from "@koklo/domain";
import type { Logger } from "@koklo/observability";
import type { PgBoss } from "pg-boss";
import {
  createWebhookDeliveryHandler,
  WEBHOOK_DELIVERY_DEFAULTS,
  WEBHOOK_DELIVERY_QUEUE,
  type WebhookDeliverySettings,
} from "../jobs/webhook-delivery.ts";
import {
  createWebhookPurgeHandler,
  WEBHOOK_PURGE_CRON,
  WEBHOOK_PURGE_QUEUE,
  WEBHOOK_PURGE_TIMEZONE,
} from "../jobs/webhook-purge.ts";
import { instrumentJob } from "../observability.ts";
import { DeliveryStore } from "./delivery-store.ts";
import { IndexWriter } from "./index-writer.ts";
import { TargetStore } from "./target-store.ts";

/** Latence de prise d'une livraison : GitHub ne l'attend pas, mais l'index doit suivre le push. */
const POLLING_INTERVAL_SECONDS = 0.5;
/** Une livraison lit la spec d'un commit ; au-delà, pg-boss considère le job perdu et le rejoue. */
const EXPIRE_IN_SECONDS = 300;

export interface WebhookRegistration {
  readonly raw: PrismaClient;
  /** `null` : ni App configurée ni fournisseur injecté ; les pushes échouent en `provider_unavailable`. */
  readonly provider: GitProvider | null;
}

/**
 * File `webhook-delivery` en `key_strict_fifo` (ordre par clé `installation:<id>` ou
 * `push:<dépôt>:<ref>`, jamais deux livraisons simultanées sur une clé), créée puis réglée par le
 * worker ; plusieurs consommateurs locaux pour que des clés différentes avancent ensemble.
 */
export async function registerWebhookDelivery(
  boss: PgBoss,
  logger: Logger,
  deps: WebhookRegistration,
  overrides: Partial<WebhookDeliverySettings> = {},
): Promise<void> {
  const settings = { ...WEBHOOK_DELIVERY_DEFAULTS, ...overrides };
  const options = {
    retryLimit: settings.retryLimit,
    retryDelay: settings.retryDelaySeconds,
    retryBackoff: true,
    expireInSeconds: EXPIRE_IN_SECONDS,
  };
  await boss.createQueue(WEBHOOK_DELIVERY_QUEUE, { ...options, policy: "key_strict_fifo" });
  // `createQueue` ne réécrit pas une file existante ; la politique, elle, ne change jamais.
  await boss.updateQueue(WEBHOOK_DELIVERY_QUEUE, options);
  const client = withTenantIsolation(deps.raw);
  const targets = new TargetStore(deps.raw, client);
  const handler = createWebhookDeliveryHandler({
    targets,
    writer: new IndexWriter(client),
    client,
    deliveries: new DeliveryStore(deps.raw),
    provider: deps.provider,
    logger,
    retryLimit: settings.retryLimit,
  });
  await boss.work(
    WEBHOOK_DELIVERY_QUEUE,
    { localConcurrency: settings.concurrency, pollingIntervalSeconds: POLLING_INTERVAL_SECONDS },
    instrumentJob(logger, WEBHOOK_DELIVERY_QUEUE, handler),
  );
}

/** File `webhook-purge` et sa planification unique (le redémarrage ne la duplique pas). */
export async function registerWebhookPurge(
  boss: PgBoss,
  logger: Logger,
  deps: { readonly raw: PrismaClient; readonly retentionDays: number },
): Promise<void> {
  await boss.createQueue(WEBHOOK_PURGE_QUEUE);
  const handler = createWebhookPurgeHandler({
    deliveries: new DeliveryStore(deps.raw),
    logger,
    retentionDays: deps.retentionDays,
  });
  await boss.work(WEBHOOK_PURGE_QUEUE, instrumentJob(logger, WEBHOOK_PURGE_QUEUE, handler));
  await boss.schedule(WEBHOOK_PURGE_QUEUE, WEBHOOK_PURGE_CRON, null, {
    tz: WEBHOOK_PURGE_TIMEZONE,
  });
}
