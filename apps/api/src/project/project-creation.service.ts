import type { CreationStatus, ProjectCreateInput } from "@koklo/contract";
import { InvalidRepoNameError, specRepoName } from "@koklo/github";
import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_ROLES } from "../auth/roles.ts";
import type { AuthSession } from "../auth/session.ts";
import { InvitationRepository } from "../invitation/invitation.repository.ts";
import { InvitationService } from "../invitation/invitation.service.ts";
import { ProjectCreationQueue } from "../queue/project-creation-queue.ts";
import { requestLogger } from "../request-logger.ts";
import { conflict, notFound, validation } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  type CreatedProject,
  type LatestCreation,
  PROJECT_CREATION_REPOSITORY,
  type ProjectCreationRepository,
} from "./project-creation.repository.ts";
import { creationStatusOf } from "./project-creation-status.ts";

const isManager = (role: string | undefined): boolean =>
  MANAGER_ROLES.some((manager) => manager === role);

const statusOf = (latest: LatestCreation, role: string | undefined): CreationStatus =>
  creationStatusOf(latest.record, {
    ideaPages: latest.ideaPages,
    invited: latest.invited,
    canAct: isManager(role),
  });

/** Nom de dépôt refusé avant tout réseau : `VALIDATION` sur le champ `repoName`. */
function repoNameOf(projectName: string, requested: string | undefined): string {
  try {
    return specRepoName(projectName, requested);
  } catch (error) {
    if (error instanceof InvalidRepoNameError) throw validation("repoName", error.message);
    throw error;
  }
}

/**
 * Création de projet en une étape (TK-93, B301 à B304) : projet, pages d'idée, ligne de création et
 * audit en une transaction ; le worker crée ensuite le dépôt de spec. Réservée à owner et admin
 * (garde de rôle, relue en base). L'invitation du client passe par `InvitationService` (B303).
 */
@Injectable()
export class ProjectCreationService {
  constructor(
    @Inject(PROJECT_CREATION_REPOSITORY) private readonly repository: ProjectCreationRepository,
    @Inject(ProjectCreationQueue) private readonly queue: ProjectCreationQueue,
    @Inject(InvitationService) private readonly invitations: InvitationService,
    @Inject(InvitationRepository) private readonly invitationChecks: InvitationRepository,
  ) {}

  async create(
    session: AuthSession,
    input: ProjectCreateInput,
    headers: Headers,
  ): Promise<{ id: string; name: string }> {
    const { organizationId } = session;
    const key = input.idempotencyKey ?? null;
    const replay = key === null ? null : await this.repository.findByKey(organizationId, key);
    if (replay) return { id: replay.id, name: replay.name };
    const client = await this.clientTargetOf(organizationId, input.clientEmail);
    const installationId = await this.installationOf(organizationId, input.installationId);
    const created = await this.repository.create(session, {
      name: input.name,
      euOnly: input.euOnly ?? false,
      ideaTemplate: input.ideaTemplate ?? "default",
      repoName: repoNameOf(input.name, input.repoName),
      installationId,
      idempotencyKey: key,
      clientUserId: client.userId,
      invitationId: client.invitationId,
    });
    if (!created.replayed) {
      await this.dispatch(session, created);
      if (client.invite) await this.invite(session, created, input.clientEmail, headers);
    }
    return { id: created.id, name: created.name };
  }

  /**
   * Ce que l'adresse du client devient (B303), décidé AVANT toute écriture : membre d'un autre rôle que
   * client = `VALIDATION` ; membre client = accès direct ; invitation vivante = le projet y est ajouté ;
   * sinon une invitation est envoyée juste après la transaction.
   */
  private async clientTargetOf(organizationId: string, email: string | undefined) {
    const none = { userId: null, invitationId: null, invite: false };
    if (email === undefined) return none;
    const member = await this.invitationChecks.memberByEmail(organizationId, email);
    if (member) {
      if (member.role !== "client") {
        throw validation(
          "clientEmail",
          "Cette adresse appartient déjà à un membre de l'organisation.",
        );
      }
      return { ...none, userId: member.userId };
    }
    const invitationId = await this.invitationChecks.liveInvitationId(organizationId, email);
    return invitationId ? { ...none, invitationId } : { ...none, invite: true };
  }

  /** Compte GitHub choisi : une installation active de l'organisation, sinon `VALIDATION`. */
  private async installationOf(
    organizationId: string,
    installationId: string | undefined,
  ): Promise<string | null> {
    if (installationId === undefined) return null;
    const found = await this.repository.installation(organizationId, installationId);
    if (!found) throw validation("installationId", "Ce compte GitHub n'est pas disponible.");
    return found.id;
  }

  /** Confie la création du dépôt au worker ; si la file refuse, la ligne passe en échec relançable. */
  private async dispatch(session: AuthSession, created: CreatedProject): Promise<void> {
    if (!created.queued) return;
    try {
      await this.queue.enqueue({ id: created.creationId });
    } catch {
      // `PgBossProducer` a déjà journalisé et signalé l'erreur ; l'écran offre « Réessayer ».
      await this.repository.failEnqueue(
        { organizationId: session.organizationId, userId: session.userId, projectId: created.id },
        created.creationId,
      );
    }
  }

  /** Invitation du client une fois le projet validé ; une panne d'envoi ne défait pas le projet (journalisée). */
  private async invite(
    session: AuthSession,
    created: CreatedProject,
    email: string | undefined,
    headers: Headers,
  ): Promise<void> {
    if (email === undefined) return;
    try {
      await this.invitations.create(
        session,
        { email, role: "client", projectIds: [created.id] },
        headers,
      );
    } catch (error) {
      await this.repository.markInvitationFailed(
        { organizationId: session.organizationId, userId: session.userId, projectId: created.id },
        created.creationId,
      );
      requestLogger().error(
        { projectId: created.id, errorName: error instanceof Error ? error.name : "erreur" },
        "project.create : projet créé, invitation du client non envoyée",
      );
    }
  }

  async status(scope: ProjectScope, role: string | undefined): Promise<CreationStatus | null> {
    const latest = await this.repository.latestCreation(scope);
    return latest ? statusOf(latest, role) : null;
  }

  async retry(
    scope: ProjectScope,
    role: string | undefined,
    input: { repoName?: string | undefined; installationId?: string | undefined },
  ): Promise<CreationStatus> {
    const name = await this.repository.projectName(scope);
    if (name === null) throw notFound();
    const latest = await this.repository.latestCreation(scope);
    const repoName = repoNameOf(name, input.repoName ?? latest?.record.repoName);
    const installationId = await this.installationOf(
      scope.organizationId,
      input.installationId ?? latest?.installationId ?? undefined,
    );
    if (installationId === null) throw validation("installationId", "Choisissez un compte GitHub.");
    const outcome = await this.repository.retry(scope, { repoName, installationId });
    if (outcome.kind === "refused") throw conflict(outcome.reason);
    await this.dispatch(scope, {
      id: scope.projectId,
      name,
      creationId: outcome.creationId,
      queued: true,
      replayed: false,
    });
    return this.requireStatus(scope, role);
  }

  private async requireStatus(
    scope: ProjectScope,
    role: string | undefined,
  ): Promise<CreationStatus> {
    const status = await this.status(scope, role);
    if (!status) throw notFound();
    return status;
  }

  async setEuOnly(scope: ProjectScope, euOnly: boolean): Promise<{ euOnly: boolean }> {
    await this.repository.setEuOnly(scope, euOnly);
    return { euOnly };
  }
}
