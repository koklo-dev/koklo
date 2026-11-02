import { All, Controller, Inject, Req, Res } from "@nestjs/common";
import { toNodeHandler } from "better-auth/node";
import type { Request, Response } from "express";
import { AUTH } from "./auth.tokens.ts";
import type { Auth } from "./auth.ts";
import { BetterAuthSessionResolver } from "./better-auth-session.resolver.ts";
import { OrganizationChannelPolicy } from "./organization-channel.ts";

/**
 * Monte Better Auth sur `/api/auth/*` (connexion GitHub, callback, sortie de session). Le handler
 * relit un corps déjà analysé par Nest : le body parsing d'oRPC n'est pas touché. Les routes du
 * plugin `organization` passent d'abord par `OrganizationChannelPolicy` (TK-55 B1-bis) : le plugin
 * n'applique aucun garde de rôle de l'api.
 */
@Controller("api/auth")
export class AuthController {
  private readonly handler: ReturnType<typeof toNodeHandler>;
  private readonly policy: OrganizationChannelPolicy;

  constructor(
    @Inject(AUTH) auth: Auth,
    @Inject(BetterAuthSessionResolver) sessions: BetterAuthSessionResolver,
  ) {
    this.handler = toNodeHandler(auth);
    this.policy = new OrganizationChannelPolicy(sessions);
  }

  @All("*splat")
  async handle(@Req() request: Request, @Res() response: Response): Promise<void> {
    const verdict = await this.policy.check(request.method, request.originalUrl, request.headers);
    if (verdict === "deny") {
      response.status(403).json({ code: "FORBIDDEN", message: "Accès refusé" });
      return;
    }
    await this.handler(request, response);
  }
}
