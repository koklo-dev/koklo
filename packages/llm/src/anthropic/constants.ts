/** URL de l'API Anthropic : constante du code, jamais configurable (pas de SSRF, TK-54 D2). */
export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_API_VERSION = "2023-06-01";
/** Plafond de lecture d'une réponse (octets) : au-delà, la lecture est interrompue. */
export const ANTHROPIC_MAX_RESPONSE_BYTES = 1_048_576;
/** Modèle de repli (à confirmer au Green avec la liste officielle). */
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5-5";
