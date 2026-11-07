import { errorCode, errorData } from "./api-error.ts";
import { GENERIC_ERROR } from "./form-errors.ts";

const NOT_SAVED = "La clé n'a pas été enregistrée.";

const PROVIDER_REASONS: Record<string, string> = {
  auth: `La clé a été refusée. ${NOT_SAVED}`,
  quota: `Le crédit du compte est épuisé. ${NOT_SAVED}`,
  timeout: `Le service n'a pas répondu à temps. ${NOT_SAVED} Réessayez.`,
  unavailable: `Le service est momentanément indisponible. ${NOT_SAVED} Réessayez.`,
  model_not_found: `Le modèle indiqué n'existe pas. ${NOT_SAVED}`,
};

/**
 * Message d'un échec d'ajout ou de remplacement de clé : fixe, sans nom de fournisseur, sans adresse, sans écho de
 * la saisie (B15, B122). Toujours dit que la clé n'a pas été enregistrée.
 */
export function keyFailureMessage(error: unknown): string {
  switch (errorCode(error)) {
    case "LLM_PROVIDER_ERROR": {
      const reason = errorData(error)?.reason;
      const known = typeof reason === "string" ? PROVIDER_REASONS[reason] : undefined;
      return known ?? `Le test a échoué. ${NOT_SAVED}`;
    }
    case "LLM_RATE_LIMITED":
      return `Trop d'essais pour le moment (5 par heure). Réessayez plus tard. ${NOT_SAVED}`;
    case "CONFLICT":
      return "Ce fournisseur est déjà configuré.";
    case "VALIDATION":
      return `L'adresse ou le modèle indiqué est refusé. ${NOT_SAVED}`;
    case "ENCRYPTION_UNAVAILABLE":
      return `Le coffre des clés n'est pas disponible. ${NOT_SAVED} Réessayez plus tard.`;
    default:
      return `${GENERIC_ERROR} ${NOT_SAVED}`;
  }
}
