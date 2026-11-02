import { type AiErrorView, describeAiError } from "./ai-errors.ts";
import { errorCode, errorData } from "./api-error.ts";
import { GENERIC_ERROR } from "./form-errors.ts";

/**
 * Issues d'échec des écritures de la clé (S-ai-settings §4.7 à §4.9). Jamais le message de l'erreur (il peut venir
 * du fournisseur ou répéter la saisie), jamais la valeur de la clé : seul le code et la raison sont lus.
 */
export interface AlertView {
  icon: "lock" | "schedule" | "warning";
  title?: string;
  text: string;
  detail?: string;
  /** Limite de vérifications atteinte : le compte à rebours suit le texte. */
  countdown?: boolean;
}

export interface Failure {
  /** `UNAUTHORIZED` : l'écran redirige sans rien afficher. */
  redirect?: boolean;
  /** `FORBIDDEN` : le rôle a changé, même message que pour un non-administrateur. */
  forbidden?: boolean;
  /** `VALIDATION` (422) : message générique du champ, sans écho. */
  invalidKey?: boolean;
  alert?: AlertView;
  rate?: AiErrorView;
  /** Rouvre le formulaire de remplacement. */
  reopen?: boolean;
  unreadable?: boolean;
  invalidated?: boolean;
  /** L'état réel du serveur est à relire. */
  reload?: boolean;
}

const VAULT: AlertView = {
  icon: "warning",
  text: "Le coffre des clés n'est pas disponible. Réessayez plus tard.",
};
const SAVE_FAILED: AlertView = {
  icon: "warning",
  text: "Impossible d'enregistrer la clé. Vérifiez votre connexion puis saisissez de nouveau la clé : par sécurité, elle n'est jamais conservée sur cet écran.",
};
const REMOVE_FAILED: AlertView = {
  icon: "warning",
  text: "Impossible de retirer la clé. Réessayez.",
};
const VERIFY_FAILED = "La vérification a échoué. Réessayez.";
const VERIFY_FAILED_GENERIC: AlertView = {
  icon: "warning",
  text: `La vérification a échoué. ${GENERIC_ERROR}`,
};
const REFUSED: AlertView = {
  icon: "warning",
  title: "Clé enregistrée, mais refusée par le fournisseur",
  text: "Vérifiez que la clé est correcte et active, puis saisissez-la de nouveau. Vous pouvez aussi la retirer.",
};
const RATE_LIMITED: AlertView = {
  icon: "schedule",
  text: "Trop de vérifications pour le moment.",
  detail: "Votre clé a bien été enregistrée ; seule la vérification est reportée.",
  countdown: true,
};

const PROVIDER_TEXTS: Record<string, string> = {
  quota: "Le crédit du compte du fournisseur est épuisé : à vérifier sur votre compte Anthropic.",
  timeout: "Le fournisseur n'a pas répondu à temps. Réessayez.",
  unavailable: "Le service d'IA est momentanément indisponible.",
  model_not_found: "Le modèle indiqué n'existe pas. Corrigez-le dans « Avancé » ou videz le champ.",
};

/** Échecs communs aux trois écritures. */
function common(code: string | undefined): Failure | null {
  if (code === "UNAUTHORIZED") return { redirect: true };
  if (code === "FORBIDDEN") return { forbidden: true };
  if (code === "ENCRYPTION_UNAVAILABLE") return { alert: VAULT };
  return null;
}

const reasonOf = (error: unknown): string | undefined => {
  const reason = errorData(error)?.reason;
  return typeof reason === "string" ? reason : undefined;
};

/** `set` : tout échec laisse l'état du serveur incertain, donc ressaisie obligatoire et liste rechargée. */
export function setFailure(error: unknown): Failure {
  const code = errorCode(error);
  if (code === "VALIDATION") return { invalidKey: true };
  return common(code) ?? { alert: SAVE_FAILED, reload: true };
}

/** `remove` : le cas 404 (déjà retirée) est traité en succès par l'appelant. */
export function removeFailure(error: unknown): Failure {
  return common(errorCode(error)) ?? { alert: REMOVE_FAILED };
}

/** 409 `LLM_NOT_CONFIGURED` : la carte repasse à l'état que le serveur annonce. */
function notConfigured(error: unknown): Failure {
  const reason = reasonOf(error);
  if (reason === "undecryptable") return { unreadable: true, reload: true };
  if (reason === "invalidated") return { invalidated: true, reload: true };
  return { reload: true };
}

function providerFailure(error: unknown): Failure {
  const reason = reasonOf(error);
  if (reason === "auth") return { alert: REFUSED, reopen: true, reload: true };
  const text =
    reason !== undefined && Object.hasOwn(PROVIDER_TEXTS, reason)
      ? PROVIDER_TEXTS[reason]
      : VERIFY_FAILED;
  return { alert: { icon: "warning", text: text ?? VERIFY_FAILED } };
}

/** `verify` : la clé reste enregistrée dans tous les cas (sauf 409), « Vérifier à nouveau » suffit. */
export function verifyFailure(error: unknown): Failure {
  const code = errorCode(error);
  const known = common(code);
  if (known) return known;
  if (code === "LLM_NOT_CONFIGURED") return notConfigured(error);
  if (code === "LLM_RATE_LIMITED") return { alert: RATE_LIMITED, rate: describeAiError(error) };
  if (code === "LLM_PROVIDER_ERROR") return providerFailure(error);
  return { alert: VERIFY_FAILED_GENERIC };
}
