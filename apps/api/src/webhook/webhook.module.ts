import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { AppConfig } from "../config.ts";
import { APP_CONFIG } from "../database/database.module.ts";
import { requestLogger } from "../request-logger.ts";
import { WebhookController } from "./webhook.controller.ts";
import { WebhookService } from "./webhook.service.ts";
import { mountFirst, webhookBodyParser } from "./webhook-body-parser.ts";
import { WebhookDeliveryQueue } from "./webhook-delivery.queue.ts";
import { WebhookDeliveryRepository } from "./webhook-delivery.repository.ts";

@Module({
  controllers: [WebhookController],
  providers: [WebhookService, WebhookDeliveryQueue, WebhookDeliveryRepository],
})
export class WebhookModule implements OnModuleInit {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost,
  ) {}

  onModuleInit(): void {
    // Contexte d'application sans serveur HTTP (CLI d'import) : pas de route à protéger.
    const server = this.adapter.httpAdapter;
    if (!server) return;
    if (!this.config.githubWebhookSecret) {
      requestLogger().warn(
        "GITHUB_WEBHOOK_SECRET is not set: POST /api/webhooks/github answers 503 until it is configured",
      );
    }
    mountFirst(server.getInstance(), webhookBodyParser(this.config.githubWebhookSecret));
  }
}
