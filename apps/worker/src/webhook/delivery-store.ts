import type { PrismaClient } from "@koklo/db";
import { type DeliveryOutcome, type DeliveryRow, errorCodeOf } from "./types.ts";

/** Lots de la purge : bornent la durée de chaque requête. */
export const PURGE_BATCH_SIZE = 1000;

/**
 * Accès au journal de réception. `webhook_deliveries` n'a pas d'organisation et reste hors du filtre
 * multi-tenant : tout passe par le client brut, par identifiant de ligne ou par installation.
 */
export class DeliveryStore {
  constructor(private readonly raw: PrismaClient) {}

  async load(id: string): Promise<DeliveryRow | null> {
    return this.raw.webhookDelivery.findUnique({
      where: { id },
      select: { id: true, event: true, status: true, payload: true },
    });
  }

  /** `received|processing|failed -> processing`, essai compté ; faux si la ligne est déjà réglée. */
  async begin(id: string): Promise<boolean> {
    const { count } = await this.raw.webhookDelivery.updateMany({
      where: { id, status: { in: ["received", "processing", "failed"] } },
      data: { status: "processing", attempts: { increment: 1 } },
    });
    return count === 1;
  }

  /**
   * Écrit le résultat : statut, code d'erreur fermé (ou rien) et instant de règlement. Sans effet
   * si la ligne a été effacée entre-temps (purge, effacement RGPD) : `updateMany` ne lève pas.
   */
  async settle(id: string, outcome: DeliveryOutcome): Promise<void> {
    await this.raw.webhookDelivery.updateMany({
      where: { id },
      data: {
        status: outcome.status,
        errorCode: errorCodeOf(outcome),
        processedAt: new Date(),
      },
    });
  }

  /** Supprime un lot de livraisons reçues avant `cutoff` ; rend le nombre de lignes supprimées. */
  async purgeBefore(cutoff: Date): Promise<number> {
    const expired = await this.raw.webhookDelivery.findMany({
      where: { receivedAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { receivedAt: "asc" },
      take: PURGE_BATCH_SIZE,
    });
    if (expired.length === 0) return 0;
    const { count } = await this.raw.webhookDelivery.deleteMany({
      where: { id: { in: expired.map((row) => row.id) } },
    });
    return count;
  }
}
