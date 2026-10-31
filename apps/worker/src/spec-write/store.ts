import {
  type PrismaClient,
  type TenantClient,
  withOrganization,
  withTenantIsolation,
} from "@koklo/db";
import { isRecord } from "../job-support.ts";
import type { BatchAuthor, BatchStatus, LoadedBatch, Outcome } from "./types.ts";

const OPEN: BatchStatus[] = ["queued", "committing"];

/**
 * Accès base du job. Le lot n'est connu que par son identifiant : l'organisation se lit d'abord
 * par le client brut (seule lecture hors contexte), tout le reste passe par le client multi-tenant
 * sous `withOrganization`. Chaque méthode est une requête courte ; rien ici n'ouvre de transaction
 * pendant qu'un appel au fournisseur est en cours.
 */
export class SpecWriteStore {
  private readonly client: TenantClient;

  constructor(private readonly raw: PrismaClient) {
    this.client = withTenantIsolation(raw);
  }

  async load(batchId: string): Promise<LoadedBatch | null> {
    const owner = await this.raw.specWriteBatch.findUnique({
      where: { id: batchId },
      select: { organizationId: true },
    });
    if (!owner) return null;
    const row = await withOrganization(owner.organizationId, () =>
      this.client.specWriteBatch.findFirst({
        where: { id: batchId },
        include: {
          operations: { orderBy: { position: "asc" } },
          repo: { include: { installation: true } },
        },
      }),
    );
    if (!row) return null;
    return {
      id: row.id,
      organizationId: row.organizationId,
      status: row.status,
      branch: row.branch,
      baseSha: row.baseSha,
      message: row.message,
      authorRole: row.authorRole,
      authorUserId: row.authorUserId,
      operations: row.operations.map((operation) => ({
        position: operation.position,
        kind: operation.kind,
        targetSpecId: operation.targetSpecId,
        payload: isRecord(operation.payload) ? operation.payload : {},
      })),
      repo: {
        id: row.repo.id,
        name: row.repo.name,
        ownerLogin: row.repo.ownerLogin,
        specPath: row.repo.specPath,
      },
      installation: {
        externalId: row.repo.installation.externalId,
        ownerKind: row.repo.installation.ownerKind,
        ownerLogin: row.repo.installation.ownerLogin,
      },
    };
  }

  /** L'utilisateur de la session, relu par son identifiant ; `null` s'il a été supprimé. */
  async author(batch: LoadedBatch): Promise<BatchAuthor | null> {
    if (batch.authorUserId === null) return null;
    return this.raw.user.findUnique({
      where: { id: batch.authorUserId },
      select: { name: true, email: true },
    });
  }

  /** `queued -> committing`, posé juste avant `writeCommit` ; sans effet si le lot est déjà pris (reprise d'un job). */
  async markCommitting(batch: LoadedBatch): Promise<void> {
    await withOrganization(batch.organizationId, () =>
      this.client.specWriteBatch.updateMany({
        where: { id: batch.id, status: "queued" },
        data: { status: "committing" },
      }),
    );
  }

  /** Écrit le résultat final d'un lot encore ouvert (jamais par-dessus un statut terminal). */
  async settle(batch: LoadedBatch, outcome: Outcome): Promise<void> {
    const common = outcome.report ? { report: outcome.report as object } : {};
    const data =
      outcome.status === "committed"
        ? {
            status: outcome.status,
            commitSha: outcome.commitSha,
            committedAt: new Date(),
            ...common,
          }
        : { status: outcome.status, errorCode: outcome.errorCode, ...common };
    await withOrganization(batch.organizationId, () =>
      this.client.specWriteBatch.updateMany({
        where: { id: batch.id, status: { in: OPEN } },
        data,
      }),
    );
  }
}
