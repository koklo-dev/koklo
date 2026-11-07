import type { AiProviderItemOutput } from "@koklo/contract";
import { AI_USAGES, type AiRouting, llmProviderTraits } from "@koklo/domain";
import { ORPCError } from "@orpc/server";
import type { LlmCredentialStatus } from "../llm-credential/llm-credential.repository.ts";
import { validation } from "../tracker/api-errors.ts";
import { AiSettingsInputError, type AiSettingsView } from "./ai-settings.service.ts";

/**
 * Élément de la liste des fournisseurs : statut (« verified » dès qu'un test ou un appel a réussi),
 * rôle dans le routage. Ni clé, ni adresse de base, ni identifiant : seulement ce que l'écran affiche.
 */
export function providerItemOf(
  status: LlmCredentialStatus,
  routing: Pick<AiRouting, "primary" | "fallback">,
): AiProviderItemOutput {
  const traits = llmProviderTraits(status.provider);
  const role =
    routing.primary === status.provider
      ? "primary"
      : routing.fallback === status.provider
        ? "fallback"
        : null;
  return {
    provider: status.provider,
    role,
    status: status.invalid ? "invalid" : status.lastUsedAt === null ? "unverified" : "verified",
    ...(status.lastUsedAt === null ? {} : { lastUsedAt: status.lastUsedAt }),
    ...(status.defaultModel === null ? {} : { defaultModel: status.defaultModel }),
    intermediary: traits.intermediary,
    euEligible: traits.euEligible,
    baseUrlRequired: traits.baseUrlRequired,
  };
}

/** Réglages de l'écran : une ligne par usage, le modèle choisi s'il y en a un (sinon « par défaut »). */
export function settingsOutputOf(view: AiSettingsView) {
  return {
    fallbackEnabled: view.fallbackEnabled,
    ...(view.monthlyCapMicroUsd === undefined
      ? {}
      : { monthlyCapMicroUsd: view.monthlyCapMicroUsd }),
    usages: AI_USAGES.map((usage) => {
      const choice = view.usageModels[usage];
      return choice === undefined
        ? { usage, isDefault: true }
        : { usage, provider: choice.provider, model: choice.model, isDefault: false };
    }),
  };
}

/** Saisie refusée par `AiSettingsService` -> `VALIDATION` (champ et raison fixes) ; le reste est relancé. */
export async function viaSettings<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof AiSettingsInputError) throw validation(error.field, error.message);
    throw error;
  }
}

/** Un fournisseur déjà configuré ne se rajoute pas : `replaceKey` change sa clé. */
export const alreadyConfigured = () =>
  new ORPCError("CONFLICT", { data: { reason: "already_configured" } });
