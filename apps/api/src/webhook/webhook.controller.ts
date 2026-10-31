import { Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { WebhookService } from "./webhook.service.ts";

const header = (request: Request, name: string): string | undefined => {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
};

/**
 * Route brute (hors oRPC, absente d'OpenAPI) : GitHub n'envoie ni session ni JSON du contrat.
 * `request.body` est le tampon d'octets posé par `webhookBodyParser`.
 */
@Controller("api/webhooks")
export class WebhookController {
  constructor(@Inject(WebhookService) private readonly webhooks: WebhookService) {}

  @Post("github")
  @HttpCode(202)
  async receive(@Req() request: Request): Promise<{ received: true }> {
    await this.webhooks.ingest({
      rawBody: Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0),
      signature: header(request, "x-hub-signature-256"),
      deliveryId: header(request, "x-github-delivery"),
      event: header(request, "x-github-event"),
    });
    return { received: true };
  }
}
