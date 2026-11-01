import type { IncomingHttpHeaders } from "node:http";
import type { PrismaClient } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import type { AuthSession, SessionResolver, UserSession } from "./session.ts";

export const TEST_SESSION_RESOLVER = Symbol("TEST_SESSION_RESOLVER");

export const TEST_SESSION_HEADER = "x-test-session";

/**
 * Session de test des e2e : `x-test-session: <userId>:<organizationId>`. Comme la session réelle,
 * le rôle est relu dans `members` à chaque requête (une requête) ; un utilisateur non membre a une
 * session SANS rôle, donc cloisonnée (fail-closed, TK-55a). Les tests d'isolation peuvent ainsi
 * s'appuyer sur de vrais rôles. Enregistré uniquement quand `APP_ENV=test` (voir `AuthModule`).
 */
@Injectable()
export class TestSessionResolver implements SessionResolver {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async resolve(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    const session = parseTestSession(headers[TEST_SESSION_HEADER]);
    return session ? withMemberRole(this.database.raw, session) : null;
  }

  async resolveUser(headers: IncomingHttpHeaders): Promise<UserSession | null> {
    const session = parseTestSession(headers[TEST_SESSION_HEADER]);
    return session ? { userId: session.userId } : null;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function withMemberRole(prisma: PrismaClient, session: AuthSession): Promise<AuthSession> {
  const { userId, organizationId } = session;
  if (!UUID.test(userId) || !UUID.test(organizationId)) {
    return session;
  }
  const membership = await prisma.member.findFirst({
    where: { userId, organizationId },
    select: { role: true },
  });
  return membership ? { ...session, role: membership.role } : session;
}

/** Exactement deux segments non vides, sinon `null`. */
export function parseTestSession(header: string | string[] | undefined): AuthSession | null {
  if (typeof header !== "string") {
    return null;
  }
  const segments = header.split(":");
  const [userId, organizationId] = segments;
  if (segments.length !== 2 || !userId || !organizationId) {
    return null;
  }
  return { userId, organizationId };
}

/** En test : l'en-tête de test d'abord, sinon la session réelle. */
export class TestFirstSessionResolver implements SessionResolver {
  constructor(
    private readonly test: SessionResolver,
    private readonly real: SessionResolver,
  ) {}

  async resolve(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    if (headers[TEST_SESSION_HEADER] !== undefined) {
      return this.test.resolve(headers);
    }
    return this.real.resolve(headers);
  }

  async resolveUser(headers: IncomingHttpHeaders): Promise<UserSession | null> {
    if (headers[TEST_SESSION_HEADER] !== undefined) {
      return this.test.resolveUser(headers);
    }
    return this.real.resolveUser(headers);
  }
}
