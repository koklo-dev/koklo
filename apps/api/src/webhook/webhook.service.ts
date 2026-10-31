import { type NormalizedWebhook, webhookDeliverySingletonKey } from "@koklo/domain";
import {
  InvalidWebhookPayloadError,
  normalizeWebhook,
  verifyWebhookSignature,
} from "@koklo/github";
import { HttpException, Inject, Injectable } from "@nestjs/common";
import type { AppConfig } from "../config.ts";
import { APP_CONFIG } from "../database/database.module.ts";
import { requestLogger } from "../request-logger.ts";
import { WebhookDeliveryQueue } from "./webhook-delivery.queue.ts";
import { type NewDelivery, WebhookDeliveryRepository } from "./webhook-delivery.repository.ts";

const DELIVERY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_PATTERN = /^[a-z_]{1,64}$/;

export interface RawDelivery {
  /** Octets exacts reçus : la signature se calcule dessus. */
  rawBody: Buffer;
  signature: string | undefined;
  deliveryId: string | undefined;
  event: string | undefined;
}

const fail = (status: number, error: string): HttpException => new HttpException({ error }, status);

function parseObject(rawBody: Buffer): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw fail(400, "invalid_body");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw fail(400, "invalid_body");
  }
  return parsed;
}

function rowOf(webhook: NormalizedWebhook): NewDelivery {
  const ignored = webhook.event !== "push" && webhook.event !== "installation";
  return {
    provider: "github",
    deliveryId: webhook.deliveryId,
    event: webhook.event,
    action: "action" in webhook ? webhook.action : null,
    installationExternalId: webhook.installationId,
    repoExternalId: "repositoryId" in webhook ? webhook.repositoryId : null,
    payload: webhook as unknown as NewDelivery["payload"],
    status: ignored ? "ignored" : "received",
    errorCode: null,
  };
}

/**
 * Ingestion d'une livraison GitHub. La signature est l'authentification (aucune session, aucun audit :
 * pas d'organisation à ce stade). Les messages d'erreur ne reprennent ni secret, ni signature, ni charge.
 * Ordre : signature (401), en-têtes (400), corps (400), événement inconnu (202 sans écriture), insertion,
 * enfilage. Le secret absent, la taille et le type sont jugés avant, par `webhookBodyParser`.
 */
@Injectable()
export class WebhookService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(WebhookDeliveryRepository) private readonly deliveries: WebhookDeliveryRepository,
    @Inject(WebhookDeliveryQueue) private readonly queue: WebhookDeliveryQueue,
  ) {}

  async ingest(delivery: RawDelivery): Promise<void> {
    const { rawBody, signature, deliveryId, event } = delivery;
    if (
      !verifyWebhookSignature({
        secret: this.config.githubWebhookSecret,
        rawBody,
        header: signature,
      })
    ) {
      throw fail(401, "invalid_signature");
    }
    if (
      deliveryId === undefined ||
      event === undefined ||
      !DELIVERY_ID_PATTERN.test(deliveryId) ||
      !EVENT_PATTERN.test(event)
    ) {
      throw fail(400, "invalid_headers");
    }
    const body = parseObject(rawBody);
    const row = this.normalize(event, deliveryId, body);
    if (row === undefined) return;
    const rowId = await this.deliveries.insertIfNew(row);
    if (rowId === null || row.status !== "received") return;
    await this.enqueue(rowId, row.payload as unknown as NormalizedWebhook);
  }

  /** `undefined` : événement non géré (ping, inconnu), rien à écrire. */
  private normalize(event: string, deliveryId: string, body: unknown): NewDelivery | undefined {
    try {
      return rowOf(normalizeWebhook(event, deliveryId, body));
    } catch (error) {
      if (!(error instanceof InvalidWebhookPayloadError)) throw error;
      if (error.reason === "unsupported_event") {
        requestLogger().info({ event }, "webhook event ignored");
        return undefined;
      }
      return {
        provider: "github",
        deliveryId,
        event: event as NewDelivery["event"],
        action: null,
        installationExternalId: null,
        repoExternalId: null,
        payload: {},
        status: "failed",
        errorCode: error.code,
      };
    }
  }

  /** Échec d'enfilage : la ligne est supprimée (un « Redeliver » repart d'une première livraison) et 503. */
  private async enqueue(rowId: string, webhook: NormalizedWebhook): Promise<void> {
    try {
      await this.queue.enqueue(
        rowId,
        webhookDeliverySingletonKey(webhook as Parameters<typeof webhookDeliverySingletonKey>[0]),
      );
    } catch {
      await this.deliveries.remove(rowId).catch(() => {
        requestLogger().warn("webhook delivery compensation failed");
      });
      throw fail(503, "webhook_unavailable");
    }
  }
}
