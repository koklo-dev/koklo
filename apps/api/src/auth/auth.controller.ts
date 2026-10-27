import { All, Controller, Inject, Req, Res } from "@nestjs/common";
import { toNodeHandler } from "better-auth/node";
import type { Request, Response } from "express";
import { AUTH } from "./auth.tokens.ts";
import type { Auth } from "./auth.ts";

/**
 * Monte Better Auth sur `/api/auth/*` (connexion GitHub, callback, sortie de session). Le handler
 * relit un corps déjà analysé par Nest : le body parsing d'oRPC n'est pas touché.
 */
@Controller("api/auth")
export class AuthController {
  private readonly handler: ReturnType<typeof toNodeHandler>;

  constructor(@Inject(AUTH) auth: Auth) {
    this.handler = toNodeHandler(auth);
  }

  @All("*splat")
  async handle(@Req() request: Request, @Res() response: Response): Promise<void> {
    await this.handler(request, response);
  }
}
