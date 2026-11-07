import { withOrganization } from "@koklo/db";
import type { AiMonthConsumption, AiUsageMeter, LlmProviderId } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock, systemClock } from "../clock.ts";
import { DatabaseService } from "../database/database.module.ts";

/** Violation de contrainte unique de Prisma : l'autre écriture a créé la ligne entre-temps. */
const UNIQUE_VIOLATION = "P2002";

/** Premier jour du mois UTC de l'instant donné (colonne `DATE`). */
const monthStartOf = (iso: string): Date => {
  const at = new Date(iso);
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
};

const asCount = (value: number, name: string): bigint => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} doit être un entier positif ou nul`);
  }
  return BigInt(value);
};

/**
 * Compteurs d'IA persistés par (organisation, mois UTC, fournisseur). Les incréments sont atomiques
 * (`calls = calls + 1` côté base) : deux appels concurrents ne perdent rien ; la création concurrente de la
 * ligne est rejouée une fois en incrément. Le marqueur d'alerte du mois est posé par une seule écriture
 * conditionnelle, donc un seul appelant gagne. Les écritures passent par le client tenant (jamais de SQL brut).
 */
@Injectable()
export class PrismaAiUsageMeter implements AiUsageMeter {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  async month(organizationId: string): Promise<AiMonthConsumption> {
    const month = monthStartOf(this.clock.now());
    return withOrganization(organizationId, async () => {
      const [rows, settings] = await Promise.all([
        this.database.client.aiUsageMonthly.findMany({ where: { month } }),
        this.database.client.aiOrganizationSettings.findFirst(),
      ]);
      const cost = rows.reduce((total, row) => total + row.costMicroUsd, 0n);
      return {
        costMicroUsd: Number(cost),
        warnedThisMonth: settings?.capWarnedMonth?.getTime() === month.getTime(),
      };
    });
  }

  async markCapWarned(organizationId: string): Promise<boolean> {
    const month = monthStartOf(this.clock.now());
    return withOrganization(organizationId, async () => {
      const { count } = await this.database.client.aiOrganizationSettings.updateMany({
        where: { OR: [{ capWarnedMonth: null }, { capWarnedMonth: { not: month } }] },
        data: { capWarnedMonth: month },
      });
      return count > 0;
    });
  }

  async record(entry: {
    readonly organizationId: string;
    readonly provider: LlmProviderId;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly costMicroUsd: number;
  }): Promise<void> {
    const inputTokens = asCount(entry.inputTokens, "inputTokens");
    const outputTokens = asCount(entry.outputTokens, "outputTokens");
    const costMicroUsd = asCount(entry.costMicroUsd, "costMicroUsd");
    const month = monthStartOf(this.clock.now());
    const upsert = () =>
      this.database.client.aiUsageMonthly.upsert({
        where: {
          organizationId_month_provider: {
            organizationId: entry.organizationId,
            month,
            provider: entry.provider,
          },
        },
        create: {
          organizationId: entry.organizationId,
          month,
          provider: entry.provider,
          calls: 1,
          inputTokens,
          outputTokens,
          costMicroUsd,
        },
        update: {
          calls: { increment: 1 },
          inputTokens: { increment: inputTokens },
          outputTokens: { increment: outputTokens },
          costMicroUsd: { increment: costMicroUsd },
        },
      });
    await withOrganization(entry.organizationId, async () => {
      try {
        await upsert();
      } catch (error) {
        if ((error as { code?: string }).code !== UNIQUE_VIOLATION) throw error;
        await upsert();
      }
    });
  }
}
