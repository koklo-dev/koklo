import type { IncomingHttpHeaders } from "node:http";
import type { PrismaClient } from "@koklo/db";
import { fromNodeHeaders } from "better-auth/node";
import type { Auth } from "./auth.ts";
import type { AuthSession, SessionResolver, UserSession } from "./session.ts";

/**
 * Résolveur réel : session Better Auth (cookie signé) + appartenance et rôle (relu
 * dans `members`) dans l'organisation active.
 * Tout cas inutilisable (session inconnue, expirée, sans organisation active, utilisateur non
 * membre) rend `null`, jamais une organisation par défaut.
 */
export class BetterAuthSessionResolver implements SessionResolver {
  constructor(
    private readonly auth: Auth,
    private readonly prisma: PrismaClient,
  ) {}

  async resolveUser(headers: IncomingHttpHeaders): Promise<UserSession | null> {
    const result = await this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
    return result ? { userId: result.user.id } : null;
  }

  async resolve(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    const result = await this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
    const organizationId = result?.session.activeOrganizationId;
    if (!result || !organizationId) {
      return null;
    }
    const userId = result.user.id;
    const membership = await this.prisma.member.findFirst({
      where: { userId, organizationId },
      select: { role: true },
    });
    return membership ? { userId, organizationId, role: membership.role } : null;
  }
}
