import type { CreationErrorCode, CreationStatus } from "@koklo/contract";
import { SPEC_REPO_NAME_ERROR } from "./spec-repo-name.ts";

/** Action proposée sous la phrase d'un échec (design/screens/S-projects.md §4.2). */
export type CreationAction =
  | "retry"
  | "relink"
  | "authorize"
  | "reauthorize"
  | "openGithub"
  | "rename"
  | "pickAccount";

export interface FailureView {
  text: string;
  actions: CreationAction[];
  /** Personne sans le droit d'agir : « Demandez à un propriétaire ou à un administrateur. » remplace les actions. */
  askAdmin: boolean;
  /** Message du nom invalide, posé sous le champ « Nom du dépôt ». */
  fieldError?: string;
}

export const ASK_ADMIN = "Demandez à un propriétaire ou à un administrateur.";
export const INVITATION_FAILED_TEXT =
  "L'invitation n'a pas pu être envoyée. Invitez le client depuis Réglages > Membres.";

type Failure = NonNullable<CreationStatus["error"]>;
type Entry = { text: (error: Failure) => string; actions: CreationAction[]; fieldError?: string };

function rateLimitText(retryAfterMs: number | undefined): string {
  const base = "GitHub limite temporairement les demandes. Réessayez dans";
  if (retryAfterMs === undefined || retryAfterMs <= 0) return `${base} un instant.`;
  const seconds = Math.ceil(retryAfterMs / 1000);
  return `${base} environ ${seconds} ${seconds === 1 ? "seconde" : "secondes"}.`;
}

function nameTakenText({ repoName, ownerLogin }: Failure): string {
  if (!repoName || !ownerLogin) return "Le nom du dépôt est déjà pris sur ce compte GitHub.";
  return `Le nom « ${repoName} » est déjà pris sur ${ownerLogin}.`;
}

const ACCESS_DENIED = (error: Failure) =>
  `GitHub refuse la création d'un dépôt sur ${error.ownerLogin ?? "ce compte"}. Un propriétaire du compte doit accorder ce droit à l'application.`;

const TABLE: Record<CreationErrorCode, Entry> = {
  no_account: {
    text: () =>
      "Aucun compte GitHub n'est relié. Le dépôt de spec attendra que vous installiez l'application.",
    actions: ["relink", "retry"],
  },
  name_taken: { text: nameTakenText, actions: ["rename"] },
  user_token_required: {
    text: () => "Koklo a besoin de votre autorisation GitHub pour créer ce dépôt.",
    actions: ["authorize"],
  },
  auth_expired_user: { text: () => "L'autorisation GitHub a expiré.", actions: ["reauthorize"] },
  auth_expired_installation: {
    text: () =>
      "L'accès de Koklo à ce compte GitHub a expiré. Réinstallez l'application depuis la page GitHub.",
    actions: ["openGithub", "retry"],
  },
  resource_not_accessible: { text: ACCESS_DENIED, actions: ["retry"] },
  provider_unavailable: {
    text: () => "GitHub ne répond pas. Votre projet est enregistré ; réessayez plus tard.",
    actions: ["retry"],
  },
  rate_limited: { text: (error) => rateLimitText(error.retryAfterMs), actions: ["retry"] },
  account_unavailable: {
    text: () => "Ce compte GitHub n'est plus disponible. Choisissez-en un autre.",
    actions: ["pickAccount"],
  },
  invalid_name: {
    text: () => "Le nom du dépôt n'est pas accepté.",
    actions: ["rename"],
    fieldError: SPEC_REPO_NAME_ERROR,
  },
  forbidden: {
    text: () =>
      "Vous n'avez plus le droit de créer un dépôt. Demandez à un propriétaire ou à un administrateur.",
    actions: [],
  },
  unknown: {
    text: () => "Le dépôt de spec n'a pas pu être créé. Une erreur est survenue.",
    actions: ["retry"],
  },
};

/** Phrase et actions d'un échec de création du dépôt, d'après son code serveur (jamais un message du fournisseur). */
export function describeCreationFailure(error: Failure, canAct: boolean): FailureView {
  const entry = TABLE[error.code];
  const view = {
    text: entry.text(error),
    ...(entry.fieldError ? { fieldError: entry.fieldError } : {}),
  };
  if (!canAct) return { ...view, actions: [], askAdmin: entry.actions.length > 0 };
  return { ...view, actions: entry.actions, askAdmin: false };
}
