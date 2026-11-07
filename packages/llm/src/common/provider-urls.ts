import type { LlmProviderId } from "@koklo/domain";

/**
 * Adresses de base des API : constantes du code, jamais configurables (sauf `openai_compatible`,
 * dont l'adresse passe par la garde anti-SSRF). Toujours passées au SDK, qui lirait sinon
 * `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` dans l'environnement.
 */
export const PROVIDER_BASE_URLS: Readonly<
  Record<Exclude<LlmProviderId, "openai_compatible">, string>
> = Object.freeze({
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://api.openai.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  mistral: "https://api.mistral.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
});
