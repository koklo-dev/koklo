import {
  type AiRouting,
  type AiUsage,
  type LlmProviderId,
  llmProviderTraits,
  type QualifiedModelCatalog,
} from "@koklo/domain";
import { ANTHROPIC_DEFAULT_MODEL } from "../anthropic/constants.ts";
import type { AiNotConfiguredReason } from "./errors.ts";

/**
 * Un fournisseur à essayer. `model` vient de la ligne d'usage ou du catalogue qualifié (secours) ;
 * `fallbackModel` sert quand la clé n'a pas de modèle par défaut.
 */
export interface Target {
  readonly provider: LlmProviderId;
  readonly model?: string;
  readonly fallbackModel?: string;
}

export interface PlanInput {
  readonly routing: AiRouting;
  readonly catalog: QualifiedModelCatalog;
  readonly usage: AiUsage;
  readonly euOnly: boolean;
}

/** Une clé existe, et le fournisseur est admis quand les données doivent rester en UE (A5). */
const eligible = ({ routing, euOnly }: PlanInput, provider: LlmProviderId): boolean =>
  routing.availableProviders.includes(provider) &&
  (!euOnly || llmProviderTraits(provider).euEligible);

/** Modèle qualifié du catalogue pour ce fournisseur et cet usage. */
export const qualifiedModel = (
  catalog: QualifiedModelCatalog,
  provider: LlmProviderId,
  usage: AiUsage,
): string | undefined =>
  catalog.list().find((entry) => entry.provider === provider && entry.usages.includes(usage))
    ?.model;

/** Modèle par défaut d'un fournisseur : le qualifié du catalogue, sinon Sonnet chez Anthropic (A4). */
const defaultModelOf = (input: PlanInput, provider: LlmProviderId): string | undefined =>
  qualifiedModel(input.catalog, provider, input.usage) ??
  (provider === "anthropic" ? ANTHROPIC_DEFAULT_MODEL : undefined);

const withDefault = (input: PlanInput, provider: LlmProviderId, model?: string): Target => {
  const fallbackModel = defaultModelOf(input, provider);
  return {
    provider,
    ...(model === undefined ? {} : { model }),
    ...(fallbackModel === undefined ? {} : { fallbackModel }),
  };
};

/** Ordre : ligne d'usage, principal, Anthropic (A4), seule clé quand il n'y a pas de principal. */
export const mainTargets = (input: PlanInput): Target[] => {
  const { routing, usage } = input;
  const row = routing.usageModels[usage];
  const available = routing.availableProviders.filter((provider) => eligible(input, provider));
  const ordered: Target[] = [];
  if (row !== undefined && eligible(input, row.provider)) {
    ordered.push(withDefault(input, row.provider, row.model));
  }
  if (routing.primary !== undefined && eligible(input, routing.primary)) {
    ordered.push(withDefault(input, routing.primary));
  }
  if (eligible(input, "anthropic")) {
    ordered.push(withDefault(input, "anthropic"));
  }
  if (routing.primary === undefined && available.length === 1) {
    ordered.push(withDefault(input, available[0] as LlmProviderId));
  }
  return ordered.filter((t, i) => ordered.findIndex((o) => o.provider === t.provider) === i);
};

/** Secours : un seul, activé, éligible, différent du servi, et avec un modèle qualifié pour l'usage. */
export const fallbackTarget = (input: PlanInput, served: LlmProviderId): Target | undefined => {
  const { routing, catalog, usage } = input;
  const provider = routing.fallback;
  if (!routing.fallbackEnabled || provider === undefined || provider === served) {
    return undefined;
  }
  const model = eligible(input, provider) ? qualifiedModel(catalog, provider, usage) : undefined;
  return model === undefined ? undefined : { provider, model };
};

/** Raison de l'absence de cible : exclusion UE seulement quand elle est la cause. */
export const notConfiguredReason = (input: PlanInput): AiNotConfiguredReason =>
  input.euOnly &&
  input.routing.availableProviders.some((provider) => !llmProviderTraits(provider).euEligible) &&
  !input.routing.availableProviders.some((provider) => eligible(input, provider))
    ? "eu-restricted"
    : "no-credential";
