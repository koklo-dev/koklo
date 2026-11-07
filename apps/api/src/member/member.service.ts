import type {
  MemberInviteInput,
  MemberInviteOutput,
  MemberListOutput,
  MemberPageInput,
  MemberPageOutput,
  MemberRemoveOutput,
  MemberRole,
  MemberSetRoleOutput,
} from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthSession } from "../auth/session.ts";
import { InvitationService } from "../invitation/invitation.service.ts";
import { conflict, forbidden, notFound } from "../tracker/api-errors.ts";
import { type MemberRecord, MemberRepository } from "./member.repository.ts";

/**
 * H3 : seul un owner touche un owner ou nomme un admin. Le rôle de l'appelant vient de la session
 * (table `members`), jamais de l'entrée.
 */
function assertMayGrant(actorRole: string | undefined, newRole: MemberRole, targetRole?: string) {
  const touchesPrivileged = newRole === "admin" || targetRole === "owner";
  if (touchesPrivileged && actorRole !== "owner") {
    throw forbidden();
  }
}

/** Refus communs à `updateRole` et `remove` : membre inconnu, soi-même (`selfReason`), H3. */
function assertMayTouch(
  session: AuthSession,
  target: MemberRecord | null,
  newRole: MemberRole,
  selfReason: "self_role" | "self_remove" | null,
): MemberRecord {
  if (!target) {
    throw notFound();
  }
  if (selfReason && target.userId === session.userId) {
    throw conflict(selfReason);
  }
  assertMayGrant(session.role, newRole, target.role);
  return target;
}

@Injectable()
export class MemberService {
  constructor(
    @Inject(MemberRepository) private readonly repository: MemberRepository,
    @Inject(InvitationService) private readonly invitations: InvitationService,
  ) {}

  list(session: AuthSession): Promise<MemberListOutput> {
    return this.repository.list(session.organizationId);
  }

  page(session: AuthSession, input: MemberPageInput): Promise<MemberPageOutput> {
    return this.repository.page(session.organizationId, input);
  }

  /** Dépréciée (2.2.0) : délègue à `invitation.create`, mêmes droits et même audit ; les projets restent facultatifs. */
  invite(
    session: AuthSession,
    input: MemberInviteInput,
    headers: Headers,
  ): Promise<MemberInviteOutput> {
    return this.invitations.create(session, input, headers, { requireProjects: false });
  }

  /** Dépréciée (2.2.0) : conserve son comportement (le changement de rôle sur soi y reste possible). */
  async setRole(
    session: AuthSession,
    memberId: string,
    role: MemberRole,
  ): Promise<MemberSetRoleOutput> {
    return this.change(session, memberId, role, null);
  }

  /** Jamais sur soi (`self_role`) ; H3 ; le dernier propriétaire reste. */
  updateRole(
    session: AuthSession,
    memberId: string,
    role: MemberRole,
  ): Promise<MemberSetRoleOutput> {
    return this.change(session, memberId, role, "self_role");
  }

  /** Jamais soi-même (`self_remove`) ni un propriétaire sans l'être ; le dernier propriétaire reste. */
  remove(session: AuthSession, memberId: string): Promise<MemberRemoveOutput> {
    return this.repository.remove(session, memberId, (target, ownerCount) => {
      const found = assertMayTouch(session, target, "dev", "self_remove");
      if (found.role === "owner" && ownerCount <= 1) {
        throw conflict("last_owner");
      }
    });
  }

  private async change(
    session: AuthSession,
    memberId: string,
    role: MemberRole,
    selfReason: "self_role" | null,
  ): Promise<MemberSetRoleOutput> {
    const updated = await this.repository.setRole(session, memberId, role, (target, ownerCount) => {
      const found = assertMayTouch(session, target, role, selfReason);
      if (found.role === "owner" && ownerCount <= 1) {
        throw conflict("last_owner");
      }
    });
    return { id: updated.id, role };
  }
}
