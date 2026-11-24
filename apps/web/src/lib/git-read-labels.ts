import { errorCode, errorData } from "./api-error.ts";

const MINUTE_MS = 60_000;

/**
 * Message d'une lecture Git refusée parce que le quota GitHub de l'installation est épuisé
 * (`PROVIDER_RATE_LIMITED`, TK-114f) : délai arrondi à la minute supérieure, 1 au moins ; sans délai
 * exploitable, « un instant ». `undefined` pour toute autre erreur (le message habituel s'applique).
 */
export function rateLimitedReadText(error: unknown): string | undefined {
  if (errorCode(error) !== "PROVIDER_RATE_LIMITED") return undefined;
  const retryAfterMs = errorData(error)?.retryAfterMs;
  const usable = typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs);
  const delay =
    usable && retryAfterMs > 0
      ? `${Math.max(1, Math.ceil(retryAfterMs / MINUTE_MS))} min`
      : "un instant";
  return `GitHub limite les lectures, réessayez dans ${delay}.`;
}
