import { conflictReason, errorCode, errorData } from "./api-error.ts";
import { SPEC_REPO_NAME_ERROR } from "./spec-repo-name.ts";

/** Table code d'erreur -> texte et action (design/screens/S-projects.md §4.1). */
export interface SpecRepoErrorContext {
  /** Login du compte GitHub choisi. */
  ownerLogin: string;
  /** Nom de dépôt saisi (vide si le champ était vide). */
  repoName: string;
}

export interface SpecRepoErrorView {
  /** Texte affiché sous le titre fixe ; jamais de valeur brute de l'erreur. */
  text: string;
  /** Action principale : « Réessayer », « Autoriser Koklo », « Réautoriser Koklo » ou « Fermer » seul. */
  action: "retry" | "authorize" | "reauthorize" | "close";
  /** `spec_repo_exists` : succès, pas une erreur. */
  alreadyExists?: boolean;
  /** Lien « Ouvrir la page GitHub » (autorisation d'installation expirée). */
  githubLink?: boolean;
  /** Champ à focaliser. */
  focus?: "repo-name";
  /** Propose « Relier un dépôt existant ». */
  offerLink?: boolean;
  /** La liste des comptes est périmée : à recharger. */
  reloadAccounts?: boolean;
  /** Erreur à poser sous le champ « Nom du dépôt » (le titre fixe reste affiché). */
  fieldError?: string;
}

const AUTHORIZE_TEXT = (login: string) =>
  `Pour créer un dépôt sur le compte ${login}, Koklo a besoin de votre autorisation. Vous serez redirigé vers GitHub, puis ramené ici.`;

const GENERIC_TEXT =
  "Le dépôt de spec n'a pas pu être créé. Une erreur est survenue. Vérifiez votre connexion puis réessayez. Si le dépôt a pu être créé malgré tout, « Réessayer » le détectera.";

function dataString(error: unknown, key: string): string | undefined {
  const value = errorData(error)?.[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function rateLimitText(error: unknown): string {
  const ms = errorData(error)?.retryAfterMs;
  const base = "GitHub limite temporairement les demandes. Réessayez dans";
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return `${base} un instant.`;
  const seconds = Math.ceil(ms / 1000);
  return `${base} environ ${seconds} ${seconds === 1 ? "seconde" : "secondes"}.`;
}

function nameTaken({ ownerLogin, repoName }: SpecRepoErrorContext): SpecRepoErrorView {
  const text = repoName
    ? `Un dépôt nommé « ${repoName} » existe déjà sur ${ownerLogin}. Il peut venir d'une tentative précédente. Choisissez un autre nom puis réessayez, ou reliez ce dépôt s'il est déjà prêt.`
    : `Le nom proposé par défaut est déjà pris sur ${ownerLogin}.`;
  return { text, action: "retry", focus: "repo-name", offerLink: true };
}

function conflict(error: unknown, context: SpecRepoErrorContext): SpecRepoErrorView {
  const reason = conflictReason(error);
  if (reason === "spec_repo_exists") {
    return { text: "Ce projet a déjà son dépôt de spec.", action: "close", alreadyExists: true };
  }
  if (reason === "repo_name_taken") return nameTaken(context);
  return { text: GENERIC_TEXT, action: "retry" };
}

function forbiddenCreation(error: unknown, ownerLogin: string): SpecRepoErrorView {
  if (dataString(error, "reason") === "resource-not-accessible") {
    return {
      text: `GitHub refuse la création d'un dépôt sur ${ownerLogin}. L'application GitHub n'a pas le droit d'y créer des dépôts : un propriétaire de ce compte doit le lui accorder dans les paramètres GitHub, ou vous pouvez choisir un autre compte.`,
      action: "retry",
    };
  }
  return { text: AUTHORIZE_TEXT(ownerLogin), action: "authorize" };
}

function authExpired(error: unknown): SpecRepoErrorView {
  if (dataString(error, "kind") === "user") {
    return { text: "Votre autorisation Koklo sur GitHub a expiré.", action: "reauthorize" };
  }
  return {
    text: "L'accès de Koklo à ce compte GitHub a expiré. Réinstallez l'application depuis la page GitHub, puis revenez réessayer.",
    action: "retry",
    githubLink: true,
  };
}

/** Vue d'une erreur de `repo.createSpec` (ou `repo.link`), d'après son code typé. Jamais de valeur brute. */
export function describeSpecRepoError(
  error: unknown,
  context: SpecRepoErrorContext,
): SpecRepoErrorView {
  const owner = dataString(error, "ownerLogin") ?? context.ownerLogin;
  switch (errorCode(error)) {
    case "PROVIDER_UNAVAILABLE":
      return {
        text: "GitHub ne répond pas, ou l'application GitHub n'est pas configurée sur cet environnement. Votre projet est enregistré ; réessayez plus tard.",
        action: "retry",
      };
    case "USER_TOKEN_REQUIRED":
      return { text: AUTHORIZE_TEXT(owner), action: "authorize" };
    case "REPO_CREATION_FORBIDDEN":
      return forbiddenCreation(error, owner);
    case "PROVIDER_AUTH_EXPIRED":
      return authExpired(error);
    case "PROVIDER_RATE_LIMITED":
      return { text: rateLimitText(error), action: "retry" };
    case "CONFLICT":
      return conflict(error, context);
    case "NOT_FOUND":
      return {
        text: "Ce compte GitHub n'est plus disponible. Choisissez-en un autre ou relancez la liste.",
        action: "retry",
        reloadAccounts: true,
      };
    case "VALIDATION":
      if (dataString(error, "field") !== "name") return { text: GENERIC_TEXT, action: "retry" };
      return {
        text: "Le nom du dépôt n'est pas accepté. Corrigez-le puis réessayez.",
        action: "retry",
        fieldError: SPEC_REPO_NAME_ERROR,
        focus: "repo-name",
      };
    case "FORBIDDEN":
      return {
        text: "Vous n'avez plus le droit de créer un dépôt. Le projet est créé : demandez à un propriétaire ou à un administrateur de relier le dépôt.",
        action: "close",
      };
    default:
      return { text: GENERIC_TEXT, action: "retry" };
  }
}
