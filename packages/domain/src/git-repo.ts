import type { GitOwner } from "./git-owner.ts";

export type Sha = string;
export type GitRef = string;
export type Visibility = "public" | "private";

export type RepoRef = { readonly owner: GitOwner; readonly name: string };

export type Repo = {
  /** Identifiant du fournisseur, rendu en chaîne : stable au renommage, relie les webhooks. */
  readonly id: string;
  readonly ref: RepoRef;
  readonly visibility: Visibility;
  readonly defaultBranch: string;
  readonly htmlUrl: string;
};

/** Écriture d'un fichier texte UTF-8. */
export type FileChange = {
  readonly path: string;
  readonly content: string;
  readonly mode?: "100644" | "100755";
};

export type FileContent = {
  readonly path: string;
  readonly ref: Sha;
  readonly content: string;
  readonly sha: Sha;
};

export type CommitAuthor = { readonly name: string; readonly email: string };

export type Commit = {
  readonly sha: Sha;
  readonly message: string;
  readonly author: CommitAuthor;
  readonly parents: readonly Sha[];
};

export type Branch = { readonly name: string; readonly sha: Sha };
export type Tag = { readonly name: string; readonly sha: Sha };

/** Rôle d'un repo dans un projet (CDC §4) : détermine ce qu'on y lit et y écrit. */
export const REPO_ROLES = Object.freeze(["spec", "front", "back", "monorepo", "mobile"] as const);
export type RepoRole = (typeof REPO_ROLES)[number];

/** Origine d'un repo : créé par koklo (`new`) ou rattaché à un repo existant (`adopted`). */
export const REPO_MODES = Object.freeze(["new", "adopted"] as const);
export type RepoMode = (typeof REPO_MODES)[number];
