import type { IncomingHttpHeaders } from "node:http";
import type { PrismaClient } from "@koklo/db";
import { fromNodeHeaders } from "better-auth/node";
import type { Auth } from "./auth.ts";
import type { AuthSession, SessionResolver } from "./session.ts";

/**
 * Résolveur réel : session Better Auth (cookie signé) + appartenance à l'organisation active.
 * Tout cas inutilisable (session inconnue, expirée, sans organisation active, utilisateur non
 * membre) rend `null`, jamais une organisation par défaut.
 */
export class BetterAuthSessionResolver implements SessionResolver {
  constructor(
    private readonly auth: Auth,
    private readonly prisma: PrismaClient,
  ) {}

  async resolve(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    const result = await this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (!result) {
      return null;
    }
    const organizationId = result.session.activeOrganizationId;
    if (!organizationId) {
      return null;
    }
    const userId = result.user.id;
    const membership = await this.prisma.member.findFirst({
      where: { userId, organizationId },
      select: { id: true },
    });
    return membership ? { userId, organizationId } : null;
  }
}
