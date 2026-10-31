import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";

type CreateManyArgs = NonNullable<
  Parameters<DatabaseService["raw"]["webhookDelivery"]["createMany"]>[0]
>;
type DeliveryRow = Exclude<CreateManyArgs["data"], readonly unknown[]>;

export type NewDelivery = Pick<
  DeliveryRow,
  | "deliveryId"
  | "event"
  | "action"
  | "installationExternalId"
  | "repoExternalId"
  | "payload"
  | "status"
  | "errorCode"
> & { provider: "github" };

/**
 * `webhook_deliveries` n'a pas d'organisation : accès par le client brut, jamais par le client tenant.
 */
@Injectable()
export class WebhookDeliveryRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  /** `INSERT ... ON CONFLICT (provider, delivery_id) DO NOTHING` ; l'id de la ligne, ou `null` pour un rejeu. */
  async insertIfNew(delivery: NewDelivery): Promise<string | null> {
    const created = await this.database.raw.webhookDelivery.createManyAndReturn({
      data: [delivery],
      skipDuplicates: true,
      select: { id: true },
    });
    return created[0]?.id ?? null;
  }

  async remove(id: string): Promise<void> {
    await this.database.raw.webhookDelivery.deleteMany({ where: { id } });
  }
}
