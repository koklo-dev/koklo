import {
  type PrismaClient,
  type TenantClient,
  withOrganization,
  withTenantIsolation,
} from "@koklo/db";
import type { GitOwner } from "@koklo/domain";

/** Au-delà, une référence ne peut pas être une URL de PR valide : la lecture la tronque. */
const MAX_REFERENCE_LENGTH = 300;

export interface PullRequestTicketRow {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly pullRequest: string;
}

/** Dépôt lié au projet du ticket, avec son installation. */
export interface LinkedRepo {
  readonly owner: string;
  readonly name: string;
  readonly installation: {
    readonly id: string;
    readonly externalId: string;
    readonly ownerKind: GitOwner["kind"];
    readonly ownerLogin: string;
  };
}

export interface PullRequestStore {
  /** Tickets `in_review` non supprimés qui portent une référence, par identifiant croissant. */
  ticketPage(after: string | null, limit: number): Promise<PullRequestTicketRow[]>;
  /** Dépôt de CE projet (organisation comprise) à installation active, sinon `null`. */
  linkedRepo(ticket: PullRequestTicketRow, owner: string, name: string): Promise<LinkedRepo | null>;
  /** `in_review` -> `done` si le ticket y est encore ; rend `false` (rien écrit) sinon. */
  settleMerged(ticket: PullRequestTicketRow): Promise<boolean>;
  /** Audit de PR fermée, une seule fois par ticket. */
  recordClosed(ticket: PullRequestTicketRow): Promise<void>;
}

/** Lectures par le client brut (comme `ReconcileStore`), écritures sous `withOrganization`. */
export class PrismaPullRequestStore implements PullRequestStore {
  private readonly client: TenantClient;

  constructor(private readonly raw: PrismaClient) {
    this.client = withTenantIsolation(raw);
  }

  async ticketPage(after: string | null, limit: number): Promise<PullRequestTicketRow[]> {
    const rows = await this.raw.$queryRaw<
      { id: string; organization_id: string; project_id: string; pull_request: string }[]
    >`
      SELECT id, organization_id, project_id, left(pull_request, ${MAX_REFERENCE_LENGTH}) AS pull_request
      FROM tickets
      WHERE status = 'in_review'::ticket_status AND deleted_at IS NULL AND pull_request IS NOT NULL
        AND (${after}::uuid IS NULL OR id > ${after}::uuid)
      ORDER BY id
      LIMIT ${limit}`;
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      projectId: row.project_id,
      pullRequest: row.pull_request,
    }));
  }

  async linkedRepo(
    ticket: PullRequestTicketRow,
    owner: string,
    name: string,
  ): Promise<LinkedRepo | null> {
    const repo = await this.raw.projectRepo.findFirst({
      where: {
        organizationId: ticket.organizationId,
        projectId: ticket.projectId,
        ownerLogin: { equals: owner, mode: "insensitive" },
        name: { equals: name, mode: "insensitive" },
        installation: { provider: "github", status: "active" },
      },
      select: {
        ownerLogin: true,
        name: true,
        installation: {
          select: { id: true, externalId: true, ownerKind: true, ownerLogin: true },
        },
      },
    });
    return repo && { owner: repo.ownerLogin, name: repo.name, installation: repo.installation };
  }

  async settleMerged(ticket: PullRequestTicketRow): Promise<boolean> {
    const now = new Date();
    return withOrganization(ticket.organizationId, () =>
      this.client.$transaction(async (tx) => {
        const { count } = await tx.ticket.updateMany({
          where: { id: ticket.id, status: "in_review", deletedAt: null },
          data: { status: "done" },
        });
        if (count !== 1) return false;
        await tx.lease.updateMany({
          where: { ticketId: ticket.id, releasedAt: null },
          data: { releasedAt: now },
        });
        await tx.auditLog.create({ data: this.audit(ticket, "ticket.reconcile.pr_merged") });
        return true;
      }),
    );
  }

  async recordClosed(ticket: PullRequestTicketRow): Promise<void> {
    const action = "ticket.reconcile.pr_closed";
    await withOrganization(ticket.organizationId, () =>
      this.client.$transaction(async (tx) => {
        const known = await tx.auditLog.findFirst({
          where: { ticketId: ticket.id, action },
          select: { id: true },
        });
        if (!known) await tx.auditLog.create({ data: this.audit(ticket, action) });
      }),
    );
  }

  private audit(ticket: PullRequestTicketRow, action: string) {
    return {
      organizationId: ticket.organizationId,
      actorKind: "system" as const,
      action,
      targetKind: "ticket",
      targetId: ticket.id,
      ticketId: ticket.id,
    };
  }
}
