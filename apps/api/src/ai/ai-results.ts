import type { FeatureSummary } from "@koklo/contract";
import type { LlmResponse } from "@koklo/domain";

/** Fournisseur du registre (la clé, pas `response.provider`), modèle SERVI et consommation ; aucun coût. */
export function metaOf(provider: "anthropic" | "openai" | "google", response: LlmResponse) {
  return {
    provider,
    model: response.model,
    usage: {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    },
  };
}

const normalized = (title: string): string => title.trim().toLowerCase();

/**
 * Propositions dont le titre égale celui d'une feature de l'index (casse et espaces de bord ignorés).
 * La proposition est conservée : l'humain tranche. La plus petite référence F-nnn est rendue.
 */
export function duplicatesOf(
  proposed: readonly { title: string }[],
  existing: readonly FeatureSummary[],
): { index: number; specId: string }[] {
  const byTitle = new Map<string, string>();
  for (const feature of existing) {
    const key = normalized(feature.title);
    if (!byTitle.has(key)) byTitle.set(key, feature.specId);
  }
  return proposed.flatMap((feature, index) => {
    const specId = byTitle.get(normalized(feature.title));
    return specId === undefined ? [] : [{ index, specId }];
  });
}
