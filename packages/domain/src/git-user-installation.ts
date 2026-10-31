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
