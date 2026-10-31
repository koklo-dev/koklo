import { Controller, Get, Inject, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { SESSION_RESOLVER, type SessionResolver } from "../auth/session.ts";
import { requestLogger } from "../request-logger.ts";
import {
  type CallbackOutcome,
  InstallationCallbackService,
} from "./installation-callback.service.ts";

/** Cible fixe du navigateur : relative, sans aucune valeur reçue (pas de redirection ouverte). */
const redirectTo = (outcome: CallbackOutcome) => `/github?result=${outcome}`;

/**
 * Callback GitHub : redirection navigateur, hors oRPC et absente d'OpenAPI. Elle répond toujours
 * `303` vers l'écran, même sans session (un retour de GitHub n'a pas de JSON à lire) ; jamais 500.
 */
@Controller("api/github")
export class InstallationCallbackController {
  constructor(
    @Inject(InstallationCallbackService) private readonly service: InstallationCallbackService,
    @Inject(SESSION_RESOLVER) private readonly sessions: SessionResolver,
  ) {}

  @Get("callback")
  async callback(@Req() request: Request, @Res() response: Response): Promise<void> {
    const outcome = await this.outcomeOf(request);
    response
      .status(303)
      .setHeader("Cache-Control", "no-store")
      .setHeader("Location", redirectTo(outcome))
      .end();
  }

  private async outcomeOf(request: Request): Promise<CallbackOutcome> {
    try {
      const session = await this.sessions.resolveUser(request.headers);
      return await this.service.complete(session?.userId ?? null, request.query);
    } catch (error) {
      requestLogger().warn(
        { errorName: error instanceof Error ? error.name : "erreur" },
        "installation callback failed",
      );
      return "provider_error";
    }
  }
}
