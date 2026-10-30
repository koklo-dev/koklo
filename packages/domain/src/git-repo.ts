import type { GitOwner } from "./git-owner.ts";

export type Sha = string;
export type GitRef = string;
export type Visibility = "public" | "private";

export type RepoRef = { readonly owner: GitOwner; readonly name: string };

export type Repo = {
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
