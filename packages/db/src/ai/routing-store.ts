import type { AiRouting, AiRoutingStore, AiUsage, AiUsageModel } from "@koklo/domain";
import type { TenantClient } from "../client.ts";
import { withOrganization } from "../tenant-context.ts";

/**
 * Réglages d'IA d'une organisation, lus sous `withOrganization` (modèles tenant). Sans ligne de réglages :
 * secours activé, ni principal, ni plafond. Les fournisseurs « disponibles » sont ceux dont la clé existe
 * et n'est pas invalidée ; le moteur ne lit jamais la clé ici.
 */
export class RoutingSettingsStore implements AiRoutingStore {
  constructor(private readonly client: TenantClient) {}

  load(organizationId: string): Promise<AiRouting> {
    return withOrganization(organizationId, async () => {
      const [settings, models, keys] = await Promise.all([
        this.client.aiOrganizationSettings.findFirst(),
        this.client.aiUsageModel.findMany(),
        this.client.llmProviderCredential.findMany({
          where: { invalidatedAt: null },
          select: { provider: true },
          orderBy: { provider: "asc" },
        }),
      ]);
      const usageModels: Partial<Record<AiUsage, AiUsageModel>> = {};
      for (const row of models) {
        usageModels[row.usage] = { provider: row.provider, model: row.model };
      }
      return {
        ...(settings?.primaryProvider ? { primary: settings.primaryProvider } : {}),
        ...(settings?.fallbackProvider ? { fallback: settings.fallbackProvider } : {}),
        fallbackEnabled: settings?.fallbackEnabled ?? true,
        usageModels,
        availableProviders: keys.map((key) => key.provider),
        ...(settings?.monthlyCapMicroUsd == null
          ? {}
          : { monthlyCapMicroUsd: Number(settings.monthlyCapMicroUsd) }),
      };
    });
  }
}
