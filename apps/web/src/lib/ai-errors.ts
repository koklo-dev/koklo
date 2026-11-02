import { errorCode, errorData } from "./api-error.ts";
import { GENERIC_ERROR } from "./form-errors.ts";

/**
 * Table des erreurs `LLM_*` et voisines -> vue d'erreur de l'écran de cadrage (S-framing §4.5 à §4.9).
 * Jamais le message de l'erreur (il peut venir du fournisseur), jamais l'écho du texte saisi.
 */
type AiErrorKind =
  | "not_configured"
  | "rate_limited"
  | "provider"
  | "output_invalid"
  | "prompt_rejected"
  | "encryption"
  | "not_found"
  | "forbidden"
  | "unauthorized"
  | "generic";

export interface AiErrorView {
  kind: AiErrorKind;
  /** Phrase principale de l'alerte. */
  message: string;
  /** Détail selon la raison (`missing`, `invalidated`, ...), ou `null`. */
  detail: string | null;
  /** Action proposée (« Demandez à un administrateur... »), ou `null`. */
  action: string | null;
  icon: "lock" | "schedule" | "warning";
  /** « Réessayer » est sûr. */
  retryable: boolean;
  /** `LLM_RATE_LIMITED` : secondes avant le prochain essai, sinon `null`. */
  retryAfterSeconds: number | null;
  /** `PROMPT_REJECTED` : `input` (idée, brief) ou `existing` (fonctionnalité du projet, non modifiable). */
  field: "input" | "existing" | null;
}

const NOT_CONFIGURED = "L'IA n'est pas encore configurée pour votre organisation.";
const ASK_ADMIN = "Demandez à un administrateur de l'organisation d'ajouter la clé.";
const DEFAULT_RETRY_SECONDS = 30;

const KEY_DETAILS: Record<string, string> = {
  missing: "Aucune clé n'a été enregistrée.",
  invalidated: "La clé enregistrée a été refusée par le fournisseur et a été désactivée.",
  undecryptable: "La clé enregistrée est illisible : il faut la saisir à nouveau.",
  auth: "Le fournisseur a refusé la clé de l'organisation. Elle est désactivée jusqu'à ce qu'un administrateur la remplace.",
};

const PROVIDER_TEXTS: Record<string, { message: string; retryable: boolean }> = {
  quota: {
    message: "Le crédit du compte du fournisseur est épuisé : à vérifier par un administrateur.",
    retryable: false,
  },
  timeout: { message: "Le fournisseur n'a pas répondu à temps. Réessayez.", retryable: true },
  unavailable: { message: "Le service d'IA est momentanément indisponible.", retryable: true },
  context_too_long: {
    message: "Le texte est trop long pour le modèle : raccourcissez-le.",
    retryable: false,
  },
  refused: { message: "Le modèle a refusé de traiter ce texte. Reformulez.", retryable: false },
  model_not_found: {
    message: "Le modèle configuré n'existe pas : à corriger par un administrateur.",
    retryable: false,
  },
  budget: {
    message: "Cette demande dépasserait le plafond de coût autorisé. Raccourcissez le texte.",
    retryable: false,
  },
  aborted: { message: "La demande a été annulée.", retryable: true },
};

const view = (
  kind: AiErrorKind,
  message: string,
  over: Partial<AiErrorView> = {},
): AiErrorView => ({
  kind,
  message,
  detail: null,
  action: null,
  icon: "warning",
  retryable: false,
  retryAfterSeconds: null,
  field: null,
  ...over,
});

const reasonOf = (error: unknown): string | undefined => {
  const reason = errorData(error)?.reason;
  return typeof reason === "string" ? reason : undefined;
};

const notConfigured = (reason: string | undefined): AiErrorView =>
  view("not_configured", NOT_CONFIGURED, {
    detail: reason !== undefined && Object.hasOwn(KEY_DETAILS, reason) ? KEY_DETAILS[reason] : null,
    action: ASK_ADMIN,
    icon: "lock",
  });

function providerError(error: unknown): AiErrorView {
  const reason = reasonOf(error);
  if (reason === "auth") return notConfigured("auth");
  const known = reason !== undefined && Object.hasOwn(PROVIDER_TEXTS, reason);
  const text = known
    ? PROVIDER_TEXTS[reason as string]
    : { message: PROVIDER_TEXTS.unavailable?.message ?? "", retryable: true };
  return view("provider", text?.message ?? "", { retryable: text?.retryable ?? true });
}

function rateLimited(error: unknown): AiErrorView {
  const seconds = errorData(error)?.retryAfterSeconds;
  const wait =
    typeof seconds === "number" && seconds > 0 ? Math.ceil(seconds) : DEFAULT_RETRY_SECONDS;
  return view("rate_limited", "Trop de demandes pour le moment.", {
    icon: "schedule",
    retryAfterSeconds: wait,
  });
}

function promptRejected(error: unknown): AiErrorView {
  const existing = errorData(error)?.rank === 2;
  return view(
    "prompt_rejected",
    existing
      ? "Une fonctionnalité existante du projet contient une séquence réservée ; contactez un administrateur."
      : "Votre texte contient une séquence réservée qui empêche l'envoi. Modifiez-le (par exemple retirez les blocs de code ou les lignes de balises) puis réessayez.",
    { field: existing ? "existing" : "input" },
  );
}

export function describeAiError(error: unknown): AiErrorView {
  switch (errorCode(error)) {
    case "LLM_NOT_CONFIGURED":
      return notConfigured(reasonOf(error));
    case "LLM_PROVIDER_ERROR":
      return providerError(error);
    case "LLM_RATE_LIMITED":
      return rateLimited(error);
    case "LLM_OUTPUT_INVALID":
      return view(
        "output_invalid",
        "Le modèle a renvoyé une réponse inutilisable (par exemple un lien ou du code). Rien n'a été enregistré. Réessayez ou reformulez.",
        { retryable: true },
      );
    case "PROMPT_REJECTED":
      return promptRejected(error);
    case "ENCRYPTION_UNAVAILABLE":
      return view("encryption", "Le coffre des clés n'est pas disponible. Réessayez plus tard.", {
        retryable: true,
      });
    case "NOT_FOUND":
      return view("not_found", "Projet introuvable");
    case "FORBIDDEN":
      return view("forbidden", "Le cadrage assisté n'est pas disponible pour votre rôle.");
    case "UNAUTHORIZED":
      return view("unauthorized", GENERIC_ERROR);
    default:
      return view("generic", GENERIC_ERROR, { retryable: true });
  }
}

/** « 42 s » jusqu'à 60 s, au-delà « environ 2 min ». */
export function formatRetry(seconds: number): string {
  return seconds <= 60 ? `${seconds} s` : `environ ${Math.ceil(seconds / 60)} min`;
}
