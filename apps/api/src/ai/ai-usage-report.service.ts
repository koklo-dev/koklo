import { withOrganization } from "@koklo/db";
import type { LlmProviderId } from "@koklo/domain";
import { type AiCapState, capStateOf } from "@koklo/llm";
import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../clock.ts";
import { DatabaseService } from "../database/database.module.ts";

export interface AiProviderUsage {
  readonly provider: LlmProviderId;
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costMicroUsd: number;
}

export interface AiUsageReport {
  /** Mois UTC, `AAAA-MM`. */
  readonly month: string;
  readonly providers: readonly AiProviderUsage[];
  readonly totalCostMicroUsd: number;
  readonly monthlyCapMicroUsd?: number;
  readonly state: AiCapState;
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * Consommation d'IA d'une organisation pour un mois UTC (TK-95 ; la route et l'affichage en euros sont
 * TK-98, B18) : une ligne par fournisseur, total, plafond et état (`ok`, `warning`, `suspended`).
 */
@Injectable()
export class AiUsageReportService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async report(organizationId: string, month?: string): Promise<AiUsageReport> {
    const label = month ?? this.clock.now().slice(0, 7);
    const match = MONTH.exec(label);
    if (match === null) throw new RangeError("mois attendu au format AAAA-MM");
    const start = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
    const { rows, settings } = await withOrganization(organizationId, async () => ({
      rows: await this.database.client.aiUsageMonthly.findMany({
        where: { month: start },
        orderBy: { provider: "asc" },
      }),
      settings: await this.database.client.aiOrganizationSettings.findFirst(),
    }));
    const providers = rows.map((row) => ({
      provider: row.provider,
      calls: row.calls,
      inputTokens: Number(row.inputTokens),
      outputTokens: Number(row.outputTokens),
      costMicroUsd: Number(row.costMicroUsd),
    }));
    const total = providers.reduce((sum, row) => sum + row.costMicroUsd, 0);
    const cap =
      settings?.monthlyCapMicroUsd == null ? undefined : Number(settings.monthlyCapMicroUsd);
    return {
      month: label,
      providers,
      totalCostMicroUsd: total,
      ...(cap === undefined ? {} : { monthlyCapMicroUsd: cap }),
      state: capStateOf({ costMicroUsd: total, warnedThisMonth: false }, cap),
    };
  }
}
