import type { InstallationOutput } from "@koklo/contract";
import { withOrganization } from "@koklo/db";
import type { GitUserCredentials, GitUserInstallation } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import { USER_CREDENTIALS, type UserCredentialsStore } from "../repo/tokens.ts";
import { isUniqueViolation } from "../tracker/api-errors.ts";
import { type AuditActor, recordAudit } from "../tracker/audit.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type {
  ConsumedState,
  InstallationRepository,
  LinkedInstallation,
  LinkResult,
  NewAuthState,
  StateKey,
} from "./installation.repository.ts";

/** Au plus 20 flux en attente (non consommés, non expirés) par utilisateur. */
export const MAX_PENDING_STATES = 20;

@Injectable()
export class PrismaInstallationRepository implements InstallationRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(USER_CREDENTIALS) private readonly credentials: UserCredentialsStore,
  ) {}

  private transaction<T>(organizationId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    return withOrganization(organizationId, () => this.database.client.$transaction(work));
  }

  list(actor: AuditActor, now: string): Promise<InstallationOutput[]> {
    const instant = new Date(now);
    return this.transaction(actor.organizationId, async (tx) => {
      const rows = await tx.providerInstallation.findMany({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      const tokens = await tx.providerUserCredential.findMany({
        where: { userId: actor.userId },
        select: { installationId: true, expiresAt: true, refreshExpiresAt: true },
      });
      return rows.map((row) => {
        const token = tokens.find((candidate) => candidate.installationId === row.id);
        // Un jeton expiré mais renouvelable (refresh valide) reste utilisable : le port le rafraîchit.
        const renewable = token?.refreshExpiresAt != null && token.refreshExpiresAt > instant;
        const userAuthorization = !token
          ? ("absent" as const)
          : token.expiresAt > instant || renewable
            ? ("active" as const)
            : ("expired" as const);
        return {
          id: row.id,
          provider: "github" as const,
          ownerKind: row.ownerKind,
          ownerLogin: row.ownerLogin,
          status: row.status,
          userAuthorization,
          createdAt: row.createdAt.toISOString(),
        };
      });
    });
  }

  findInstallation(
    organizationId: string,
    installationId: string,
  ): Promise<LinkedInstallation | null> {
    return this.transaction(organizationId, (tx) =>
      tx.providerInstallation.findFirst({
        where: { id: installationId },
        select: { externalId: true, status: true },
      }),
    );
  }

  async createState(
    actor: AuditActor,
    state: NewAuthState,
  ): Promise<"created" | "too_many_pending"> {
    const now = new Date(state.createdAt);
    if ((await this.pendingStatesOf(actor.userId, now)) >= MAX_PENDING_STATES) {
      return "too_many_pending";
    }
    return this.transaction(actor.organizationId, async (tx) => {
      await tx.providerAuthState.deleteMany({ where: { expiresAt: { lt: now } } });
      await tx.providerAuthState.create({
        data: {
          organizationId: actor.organizationId,
          userId: actor.userId,
          installationId: state.installationId,
          nonce: state.nonce,
          createdAt: now,
          expiresAt: new Date(state.expiresAt),
        },
      });
      await recordAudit(tx, actor, {
        action: "installation.start",
        targetKind: "organization",
        targetId: actor.organizationId,
      });
      return "created" as const;
    });
  }

  /**
   * Purge les états expirés de l'utilisateur puis compte ceux en attente, toutes organisations
   * confondues (un utilisateur peut gérer plusieurs organisations) : lecture hors filtre
   * multi-tenant, filtrée à la main sur `userId`. Hors transaction, pour ne pas attendre ses verrous.
   */
  private async pendingStatesOf(userId: string, now: Date): Promise<number> {
    const states = this.database.raw.providerAuthState;
    await states.deleteMany({ where: { userId, expiresAt: { lt: now } } });
    return states.count({ where: { userId, consumedAt: null, expiresAt: { gt: now } } });
  }

  consumeState(key: StateKey, now: string): Promise<ConsumedState | null> {
    const instant = new Date(now);
    return this.transaction(key.organizationId, async (tx) => {
      // Un seul UPDATE conditionnel : de deux retours simultanés, un seul reçoit la ligne.
      const [row] = await tx.providerAuthState.updateManyAndReturn({
        where: {
          nonce: key.nonce,
          userId: key.userId,
          consumedAt: null,
          expiresAt: { gt: instant },
        },
        data: { consumedAt: instant },
        select: { installationId: true },
      });
      return row ?? null;
    });
  }

  async isManager(actor: AuditActor): Promise<boolean> {
    // `members` est géré par Better Auth, hors filtre multi-tenant : le filtre est écrit ici.
    const member = await this.database.raw.member.findFirst({
      where: { organizationId: actor.organizationId, userId: actor.userId },
      select: { role: true },
    });
    return member?.role === "owner" || member?.role === "admin";
  }

  async link(
    actor: AuditActor,
    installation: GitUserInstallation,
    credentials: GitUserCredentials,
  ): Promise<LinkResult> {
    try {
      return await this.transaction(actor.organizationId, (tx) =>
        this.linkIn(tx, actor, installation, credentials),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Course sur (provider, external_id) : la transaction est annulée, la relecture tranche.
      return this.transaction(actor.organizationId, (tx) =>
        this.linkIn(tx, actor, installation, credentials),
      );
    }
  }

  private async linkIn(
    tx: Tx,
    actor: AuditActor,
    installation: GitUserInstallation,
    credentials: GitUserCredentials,
  ): Promise<LinkResult> {
    // L'unicité (provider, external_id) est globale : seule la lecture hors filtre voit les autres organisations.
    const existing = await this.database.raw.providerInstallation.findFirst({
      where: { provider: "github", externalId: installation.externalId },
      select: { id: true, organizationId: true },
    });
    if (existing && existing.organizationId !== actor.organizationId) return "already_linked";
    const owner = { ownerKind: installation.ownerKind, ownerLogin: installation.ownerLogin };
    const id = existing
      ? existing.id
      : (
          await tx.providerInstallation.create({
            data: {
              organizationId: actor.organizationId,
              provider: "github",
              externalId: installation.externalId,
              status: "active",
              ...owner,
            },
            select: { id: true },
          })
        ).id;
    if (existing) await tx.providerInstallation.updateMany({ where: { id }, data: owner });
    await this.credentials.save(actor.userId, id, credentials, tx);
    await recordAudit(tx, actor, {
      action: existing ? "installation.reauthorize" : "installation.link",
      targetKind: "installation",
      targetId: id,
    });
    return existing ? "reauthorized" : "linked";
  }

  recordRefusal(actor: AuditActor): Promise<void> {
    return this.transaction(actor.organizationId, (tx) =>
      recordAudit(tx, actor, {
        action: "installation.link_refused",
        targetKind: "organization",
        targetId: actor.organizationId,
      }),
    );
  }
}
