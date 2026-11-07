import type { AiProviderItemOutput } from "@koklo/contract";

export type ProviderId = AiProviderItemOutput["provider"];

/** Noms affichés : réservés à l'écran des fournisseurs (B15), nulle part ailleurs dans l'interface. */
export const PROVIDER_NAMES: Record<ProviderId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google Gemini",
  mistral: "Mistral",
  openrouter: "OpenRouter",
  openai_compatible: "Compatible OpenAI",
};

export const PROVIDER_ORDER: readonly ProviderId[] = [
  "anthropic",
  "openai",
  "google",
  "mistral",
  "openrouter",
  "openai_compatible",
];

export const providerName = (id: ProviderId): string => PROVIDER_NAMES[id];

/** Initiales de la pastille ronde (décoratives, masquées aux lecteurs d'écran). */
export const providerInitials = (id: ProviderId): string =>
  id === "openai_compatible" ? "CO" : PROVIDER_NAMES[id].slice(0, 2).toUpperCase();

/** Description d'une ligne de la grille d'ajout (maquette 24). */
export const PROVIDER_DESCRIPTIONS: Record<ProviderId, string> = {
  anthropic: "Accès direct à Claude.",
  openai: "Accès direct aux modèles GPT.",
  google: "Accès direct aux modèles Gemini.",
  mistral: "Fournisseur européen, accès direct.",
  openrouter: "Une clé pour les modèles de plusieurs fournisseurs, via un intermédiaire.",
  openai_compatible: "Tout point d'accès au format OpenAI : serveur maison, Ollama, etc.",
};
