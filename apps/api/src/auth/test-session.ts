import type { IncomingHttpHeaders } from "node:http";
import { Injectable } from "@nestjs/common";
import type { AuthSession, SessionResolver } from "./session.ts";

export const TEST_SESSION_RESOLVER = Symbol("TEST_SESSION_RESOLVER");

export const TEST_SESSION_HEADER = "x-test-session";

/**
 * Session de test des e2e : `x-test-session: <userId>:<organizationId>`.
 * Enregistré dans le module uniquement quand `APP_ENV=test` (voir `AuthModule`).
 */
@Injectable()
export class TestSessionResolver implements SessionResolver {
  async resolve(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    return parseTestSession(headers[TEST_SESSION_HEADER]);
  }
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
}
