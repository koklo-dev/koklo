import type {
  InvitationCreateInput,
  InvitationListOutput,
  InvitationOutput,
  MemberRole,
} from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { AUTH } from "../auth/auth.tokens.ts";
import { type Auth, invitationUrl } from "../auth/auth.ts";
import { PROJECT_INVITATION_ROLES } from "../auth/roles.ts";
import type { AuthSession } from "../auth/session.ts";
import type { AppConfig } from "../config.ts";
import { APP_CONFIG } from "../database/database.module.ts";
import { InvitationQueue } from "../organization/invitation-queue.ts";
import { conflict, forbidden, notFound, orNotFound, validation } from "../tracker/api-errors.ts";
import { InvitationRepository } from "./invitation.repository.ts";

export interface CreateOptions {
  /** Faux pour la route dépréciée `member.invite` (2.1.0) : un client sans projet n'a accès à rien (fail-closed). */
  requireProjects: boolean;
}

/** H3 : seul un owner nomme un admin. Le rôle de l'appelant vient de la session, jamais de l'entrée. */
function assertMayInvite(actorRole: string | undefined, role: MemberRole): void {
  if (role === "admin" && actorRole !== "owner") {
    throw forbidden();
  }
}

/** Projets proposés : obligatoires pour client et business (B98), refusés aux autres rôles. */
function projectsOf(input: InvitationCreateInput, options: CreateOptions): string[] {
  const projectIds = [...new Set(input.projectIds ?? [])];
  const takesProjects = PROJECT_INVITATION_ROLES.some((role) => role === input.role);
  if (!takesProjects && projectIds.length > 0) {
    throw validation("projectIds", "Les projets ne s'appliquent qu'aux clients et aux business");
  }
  if (takesProjects && options.requireProjects && projectIds.length === 0) {
    throw validation("projectIds", "Au moins un projet est requis pour ce rôle");
  }
  return projectIds;
}

@Injectable()
export class InvitationService {
  constructor(
    @Inject(InvitationRepository) private readonly repository: InvitationRepository,
    @Inject(InvitationQueue) private readonly queue: InvitationQueue,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(
    session: AuthSession,
    input: InvitationCreateInput,
    headers: Headers,
    options: CreateOptions = { requireProjects: true },
  ): Promise<InvitationOutput> {
    assertMayInvite(session.role, input.role);
    const projectIds = projectsOf(input, options);
    const { organizationId } = session;
    if (
      projectIds.length > 0 &&
      (await this.repository.countProjects(organizationId, projectIds)) !== projectIds.length
    ) {
      throw notFound();
    }
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
    try {
      await this.repository.record(session, invitation.id, projectIds);
    } catch (error) {
      await this.repository.discard(organizationId, invitation.id);
      throw error;
    }
    const created = await this.repository.findLive(organizationId, invitation.id);
    return orNotFound(created).view;
  }

  list(session: AuthSession): Promise<InvitationListOutput> {
    return this.repository.listLive(session.organizationId);
  }

  async resend(session: AuthSession, invitationId: string): Promise<InvitationOutput> {
    const live = await this.repository.findLive(session.organizationId, invitationId);
    if (!live) {
      throw notFound();
    }
    // Même invitation, même lien : le job est remis au worker, puis le fait est journalisé.
    await this.queue.enqueue({
      email: live.view.email,
      url: invitationUrl(this.config.betterAuthUrl, live.view.id),
      inviterName: live.view.invitedBy,
      organizationName: live.organizationName,
      role: live.view.role,
    });
    await this.repository.recordResend(session, invitationId);
    return live.view;
  }

  async revoke(session: AuthSession, invitationId: string): Promise<{ id: string }> {
    if (!(await this.repository.revoke(session, invitationId))) {
      throw notFound();
    }
    return { id: invitationId };
  }
}
