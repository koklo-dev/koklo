import type { installationCallbackOutcomeSchema } from "@koklo/contract";
import type { z } from "zod";

export type InstallationCallbackOutcome = z.infer<typeof installationCallbackOutcomeSchema>;
export type InstallationStatus = "active" | "suspended" | "deleted";
export type UserAuthorization = "absent" | "active" | "expired";

/** Textes de l'écran /github (design/screens/S-github.md §3-§4). */
export const INSTALLATION_STATUS_LABELS: Record<InstallationStatus, string> = {
  active: "Active",
  suspended: "Suspendue",
  deleted: "Désinstallée",
};
export const AUTHORIZATION_LABELS: Record<UserAuthorization, string> = {
  active: "Autorisée",
  absent: "À autoriser",
  expired: "Autorisation expirée",
};

export const ownerKindLabel = (ownerKind: "organization" | "user"): string =>
  ownerKind === "user" ? "Compte personnel" : "Organisation GitHub";

/** Message affiché au retour de GitHub : `status` pour le succès, `alert` pour tout le reste. */
export const RESULT_NOTICES: Record<
  InstallationCallbackOutcome,
  { title: string; text: string; tone: "status" | "alert" }
> = {
  installed: {
    title: "Application GitHub installée",
    text: "Le compte est relié à votre organisation. S'il reste à autoriser Koklo, utilisez le bouton « Autoriser » de la ligne.",
    tone: "status",
  },
  denied: {
    title: "Installation non terminée",
    text: "GitHub n'a pas confirmé votre accès à cette installation, ou l'autorisation a été refusée. Rien n'a été modifié. Vous pouvez recommencer.",
    tone: "alert",
  },
  invalid_state: {
    title: "Ce retour depuis GitHub n'est plus valable",
    text: "Pour votre sécurité, il dure 10 minutes et ne sert qu'une fois. Relancez l'installation depuis cette page.",
    tone: "alert",
  },
  already_linked: {
    title: "Installation déjà utilisée",
    text: "Cette installation GitHub est déjà reliée à une autre organisation Koklo. Utilisez un autre compte GitHub, ou contactez la personne qui l'a reliée.",
    tone: "alert",
  },
  not_owner: {
    title: "Seul le propriétaire du compte peut faire cette liaison",
    text: "Vous n'êtes pas propriétaire de ce compte GitHub (pour une organisation GitHub, il faut en être administrateur). Demandez-le à un propriétaire, ou connectez-vous à GitHub avec le bon compte.",
    tone: "alert",
  },
  provider_error: {
    title: "GitHub n'a pas répondu comme prévu",
    text: "Un problème est survenu pendant l'échange avec GitHub. Rien n'a été enregistré. Réessayez dans quelques minutes.",
    tone: "alert",
  },
};

export const RESTRICTED_TEXT =
  "Cette page est réservée aux propriétaires et aux administrateurs. Demandez à l'un d'eux de relier GitHub.";
export const REDIRECTING_LABEL = "Redirection vers GitHub…";
