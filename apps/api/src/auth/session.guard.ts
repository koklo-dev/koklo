import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type { Request } from "express";
import { type AuthSession, SESSION_RESOLVER, type SessionResolver } from "./session.ts";

/** Clé de la session résolue sur la requête Express. */
const SESSION_REQUEST_KEY = "kokloSession";

type RequestWithSession = Request & { [SESSION_REQUEST_KEY]?: AuthSession };

/** Session posée par le garde sur la requête ; `undefined` si la requête n'a pas traversé le garde. */
export function sessionOf(request: Request): AuthSession | undefined {
  return (request as RequestWithSession)[SESSION_REQUEST_KEY];
}

/**
 * Garde par procédure (pas global : /health et /openapi.json restent publics). Sans session :
 * `ORPCError("UNAUTHORIZED")`, rendue en 401 typé, avant tout appel au service.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(SESSION_RESOLVER) private readonly sessions: SessionResolver) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const session = await this.sessions.resolve(request.headers);
    if (!session) {
      throw new ORPCError("UNAUTHORIZED", { message: "Session absente ou expirée" });
    }
    request[SESSION_REQUEST_KEY] = session;
    return true;
  }
}
