import type {
  MemberInviteInput,
  MemberInviteOutput,
  MemberListOutput,
  MemberRole,
  MemberSetRoleOutput,
} from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { AUTH } from "../auth/auth.tokens.ts";
import type { Auth } from "../auth/auth.ts";
import type { AuthSession } from "../auth/session.ts";
import { MemberRepository } from "./member.repository.ts";

const conflict = (reason: "already_member" | "already_invited" | "last_owner") =>
  new ORPCError("CONFLICT", { data: { reason } });
const forbidden = () => new ORPCError("FORBIDDEN", { message: "Accès refusé" });
const notFound = () => new ORPCError("NOT_FOUND", { message: "Ressource introuvable" });

/**
 * H3 : seul un owner touche un owner ou nomme un admin (invitation comprise). Le rôle de
 * l'appelant vient de la session (table `members`), jamais de l'entrée.
 */
function assertMayGrant(actorRole: string | undefined, newRole: MemberRole, targetRole?: string) {
  const touchesPrivileged = newRole === "admin" || targetRole === "owner";
  if (touchesPrivileged && actorRole !== "owner") {
    throw forbidden();
  }
}

@Injectable()
export class MemberService {
  constructor(
    @Inject(MemberRepository) private readonly repository: MemberRepository,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  list(session: AuthSession): Promise<MemberListOutput> {
    return this.repository.list(session.organizationId);
  }

  async invite(
    session: AuthSession,
    input: MemberInviteInput,
    headers: Headers,
  ): Promise<MemberInviteOutput> {
    assertMayGrant(session.role, input.role);
    const { organizationId } = session;
    if (await this.repository.isMemberByEmail(organizationId, input.email)) {
      throw conflict("already_member");
    }
    if (await this.repository.hasLiveInvitation(organizationId, input.email)) {
      throw conflict("already_invited");
    }
    // Crée l'invitation puis remet le job d'envoi au worker (callback `sendInvitationEmail`).
    const invitation = await this.auth.api.createInvitation({
      body: { email: input.email, role: input.role, organizationId },
      headers,
    });
    await this.repository.recordInvitation(session, invitation.id);
    return {
      id: invitation.id,
      email: invitation.email,
      role: input.role,
      status: "pending",
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async setRole(
    session: AuthSession,
    memberId: string,
    role: MemberRole,
  ): Promise<MemberSetRoleOutput> {
    const updated = await this.repository.setRole(session, memberId, role, (target, ownerCount) => {
      if (!target) {
        throw notFound();
      }
      assertMayGrant(session.role, role, target.role);
      if (target.role === "owner" && ownerCount <= 1) {
        throw conflict("last_owner");
      }
    });
    return { id: updated.id, role };
  }
}
