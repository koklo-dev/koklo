import {
  type PrismaClient,
  type TenantClient,
  withOrganization,
  withTenantIsolation,
} from "@koklo/db";

export interface OrphanDeliveryRow {
  readonly id: string;
  readonly event: string;
  readonly payload: unknown;
}

export interface OrphanBatchRow {
  readonly id: string;
  readonly organizationId: string;
  readonly repoId: string;
  readonly branch: string;
}

/**
 * Lectures de la réconciliation. L'énumération des candidats passe par le client brut (comme
 * `DeliveryStore` et `SpecWriteStore`) ; l'écriture de l'audit, elle, est faite sous
 * `withOrganization`, jamais pour plusieurs organisations à la fois.
 */
export class ReconcileStore {
  private readonly client: TenantClient;

  private readonly raw: PrismaClient;

  constructor(raw: PrismaClient) {
    this.raw = raw;
    this.client = withTenantIsolation(raw);
  }

  /** Livraisons non réglées reçues entre `notBefore` et `olderThan`, les plus anciennes d'abord. */
  async unsettledDeliveries(
    olderThan: Date,
    notBefore: Date,
    limit: number,
  ): Promise<OrphanDeliveryRow[]> {
    return this.raw.webhookDelivery.findMany({
      where: {
        status: { in: ["received", "processing"] },
        receivedAt: { lt: olderThan, gt: notBefore },
      },
      select: { id: true, event: true, payload: true },
      orderBy: { receivedAt: "asc" },
      take: limit,
    });
  }

  /** Lots ouverts (`queued`/`committing`) enfilés avant `olderThan`, les plus anciens d'abord. */
  async openBatches(olderThan: Date, limit: number): Promise<OrphanBatchRow[]> {
    return this.raw.specWriteBatch.findMany({
      where: { status: { in: ["queued", "committing"] }, enqueuedAt: { lt: olderThan } },
      select: { id: true, organizationId: true, repoId: true, branch: true },
      orderBy: { enqueuedAt: "asc" },
      take: limit,
    });
  }

  /** Audit système d'un lot relancé ; la cible est le lot (UUID), dans SON organisation. */
  async recordBatchRequeued(batch: OrphanBatchRow): Promise<void> {
    await withOrganization(batch.organizationId, () =>
      this.client.auditLog.create({
        data: {
          organizationId: batch.organizationId,
          actorKind: "system",
          action: "spec_write_batch.requeued",
          targetKind: "spec_write_batch",
          targetId: batch.id,
        },
      }),
    );
  }
}
