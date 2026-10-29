import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ORPCError } from "@orpc/server";
import type { Request } from "express";
import {
  type AuthSession,
  SESSION_RESOLVER,
  type SessionResolver,
  type UserSession,
} from "./session.ts";

/** Clés de la session résolue sur la requête Express. */
const SESSION_REQUEST_KEY = "kokloSession";
const USER_SESSION_REQUEST_KEY = "kokloUserSession";

type RequestWithSession = Request & {
  [SESSION_REQUEST_KEY]?: AuthSession;
  [USER_SESSION_REQUEST_KEY]?: UserSession;
};

/** Session posée par le garde sur la requête ; `undefined` si la requête n'a pas traversé le garde. */
export function sessionOf(request: Request): AuthSession | undefined {
  return (request as RequestWithSession)[SESSION_REQUEST_KEY];
}

/** Utilisateur posé par `UserSessionGuard` ; `undefined` si la requête n'a pas traversé le garde. */
export function userSessionOf(request: Request): UserSession | undefined {
  return (request as RequestWithSession)[USER_SESSION_REQUEST_KEY];
}

const unauthorized = () => new ORPCError("UNAUTHORIZED", { message: "Session absente ou expirée" });

/** Session du garde, ou 401 si la requête n'a pas traversé `SessionGuard`. */
export function requireSession(request: Request): AuthSession {
  const session = sessionOf(request);
  if (!session) {
    throw unauthorized();
  }
  return session;
}

/** Utilisateur du garde, ou 401 si la requête n'a pas traversé `UserSessionGuard`. */
export function requireUserSession(request: Request): UserSession {
  const session = userSessionOf(request);
  if (!session) {
    throw unauthorized();
  }
  return session;
}

/**
 * Garde par procédure (pas global : /health et /openapi.json restent publics). Sans session ou
 * sans organisation active : `ORPCError("UNAUTHORIZED")`, rendue en 401 typé, avant tout appel
 * au service.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(SESSION_RESOLVER) private readonly sessions: SessionResolver) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const session = await this.sessions.resolve(request.headers);
    if (!session) {
      throw unauthorized();
    }
    request[SESSION_REQUEST_KEY] = session;
    return true;
  }
}

/**
 * Garde « utilisateur seul » : session valide, organisation active facultative (créer sa première
 * organisation, lister les siennes). Distinct de `SessionGuard`, qui exige une organisation.
 */
@Injectable()
export class UserSessionGuard implements CanActivate {
  constructor(@Inject(SESSION_RESOLVER) private readonly sessions: SessionResolver) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const session = await this.sessions.resolveUser(request.headers);
    if (!session) {
      throw unauthorized();
    }
    request[USER_SESSION_REQUEST_KEY] = session;
    return true;
  }
}

const ROLES_KEY = "kokloRoles";

/** Rôles autorisés pour la procédure ; à combiner avec `RoleGuard` après `SessionGuard`. */
export const Roles = (...roles: readonly string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Garde de rôle : le rôle vient de la table `members` (relu à chaque requête par le résolveur),
 * jamais de l'entrée du client. Rôle absent ou non listé : `FORBIDDEN` (403). Se place après
 * `SessionGuard`.
 */
@Injectable()
export class RoleGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const session = sessionOf(context.switchToHttp().getRequest<Request>());
    if (!allowed || !session?.role || !allowed.includes(session.role)) {
      throw new ORPCError("FORBIDDEN", { message: "Accès refusé" });
    }
    return true;
  }
}
