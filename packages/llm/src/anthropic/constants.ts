import { MAX_RESPONSE_BYTES } from "../common/constants.ts";
import { PROVIDER_BASE_URLS } from "../common/provider-urls.ts";

/** URL de l'API Anthropic : constante du code, jamais configurable (pas de SSRF, TK-54 D2). */
export const ANTHROPIC_MESSAGES_URL = `${PROVIDER_BASE_URLS.anthropic}/messages`;
export const ANTHROPIC_API_VERSION = "2023-06-01";
/** Plafond de lecture d'une réponse (octets) : au-delà, la lecture est interrompue. */
export const ANTHROPIC_MAX_RESPONSE_BYTES = MAX_RESPONSE_BYTES;
/** Modèle par défaut des quatre usages (décision A4). */
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5-5";
