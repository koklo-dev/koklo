import type { Role } from "@koklo/contract";

/** Rôles liés à des projets précis (le serveur refuse `projectIds` pour les autres, B98). */
export const PROJECT_ROLES: readonly string[] = ["client", "business"];
export const needsProjects = (role: string): boolean => PROJECT_ROLES.includes(role);

export const MEMBERS_COPY = {
  invitePhrase:
    "Un client ne voit que les projets choisis ici. L'invitation expire après 7 jours ; la personne se connecte avec GitHub ou par lien magique.",
  projectsRequired: "Choisissez au moins un projet.",
  noProject: "Aucun projet : créez-en un avant d'inviter un client.",
  lastOwner: "Une organisation garde au moins un propriétaire.",
  roleFailed: "Le rôle n'a pas pu être modifié",
  removeFailed: "Le retrait n'a pas pu aboutir",
  actionFailed: "L'action n'a pas pu aboutir",
  neverActive: "Jamais connecté",
};

const shortDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
export const formatShortDate = (iso: string): string => shortDate.format(new Date(iso));

/** Rôles de la matrice, dans l'ordre des colonnes (maquette 24). */
export const MATRIX_ROLES: ReadonlyArray<{ role: Role; label: string }> = [
  { role: "owner", label: "Propriétaire" },
  { role: "admin", label: "Administrateur" },
  { role: "dev", label: "Développeur" },
  { role: "designer", label: "Designer" },
  { role: "client", label: "Client" },
  { role: "business", label: "Business" },
];

/** Neuf actions ; `y` autorise le rôle de la colonne (propriétaire, admin, dev, designer, client, business). */
export const ROLE_MATRIX: ReadonlyArray<{ action: string; allowed: string }> = [
  {
    action: "Gérer l'organisation, les membres, les fournisseurs d'IA, GitHub",
    allowed: "yynnnn",
  },
  { action: "Rédiger la spec et accepter les propositions de l'agent", allowed: "yyyynn" },
  { action: "Modifier le design (charte, écrans)", allowed: "yyyynn" },
  { action: "Valider le fonctionnel, le design et la baseline 0", allowed: "nnnnyn" },
  { action: "Commenter et proposer des changements", allowed: "yyyyyn" },
  { action: "Gérer les tickets et les sprints", allowed: "yyyynn" },
  { action: "Prendre un ticket avec son agent local", allowed: "yyyynn" },
  { action: "Approuver et fusionner une pull request", allowed: "yyynnn" },
  { action: "Voir l'avancement et le reporting", allowed: "yyyyyy" },
];
