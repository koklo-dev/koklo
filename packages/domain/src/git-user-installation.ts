import type { GitOwner } from "./git-owner.ts";

/**
 * Installation de l'App visible d'un utilisateur (jeton utilisateur, ADR 0009). `externalId` est
 * l'identifiant du fournisseur ; `ownerKind` et `ownerLogin` sont lus chez lui, jamais déduits.
 */
export type GitUserInstallation = {
  readonly externalId: string;
  readonly ownerKind: GitOwner["kind"];
  readonly ownerLogin: string;
};

/**
 * Lien de l'utilisateur authentifié par son jeton avec le propriétaire d'une installation :
 * `self` (compte personnel : c'est lui), `admin` (administrateur actif de l'organisation),
 * `member` (membre actif sans droit d'administration) ou `none` (aucun lien, invitation en attente
 * comprise). Seuls `self` et `admin` prouvent la propriété d'une installation.
 */
export type UserOwnerRole = "self" | "admin" | "member" | "none";
