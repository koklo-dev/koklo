import type { RepoMode, RepoRole } from "@koklo/domain";
import type { ProjectScope } from "../tracker/scope.ts";

export const REPO_REPOSITORY = Symbol("REPO_REPOSITORY");

/** Installation de l'App appartenant à l'organisation du projet (jamais son jeton). */
export interface InstallationRecord {
  id: string;
  /** Identifiant chez le fournisseur : sert à authentifier, jamais exposé. */
  externalId: string;
  ownerKind: "organization" | "user";
  ownerLogin: string;
}

/** Ce que lit la première transaction : tout ce qu'il faut pour décider avant le réseau. */
export interface RepoPlan {
  projectName: string;
  organizationSlug: string;
  installation: InstallationRecord;
  /** Le projet a déjà un repo porteur de la spec (rôle `spec`, ou `spec_path` dans un monorepo). */
  hasSpecCarrier: boolean;
}

export interface NewRepo {
  installationId: string;
  role: RepoRole;
  mode: RepoMode;
  externalId: string;
  ownerLogin: string;
  name: string;
  defaultBranch: string;
  specPath: string | null;
}

export interface RepoRecord {
  id: string;
  projectId: string;
  installationId: string;
  role: RepoRole;
  mode: RepoMode;
  ownerLogin: string;
  name: string;
  defaultBranch: string;
  specPath: string | null;
}

export type RepoAction = "repo.createSpec" | "repo.link";
export type RepoConflict = "spec_repo_exists" | "repo_already_linked";
export type InsertOutcome = { repo: RepoRecord } | { conflict: RepoConflict };

/** Accès aux repos du projet ; chaque méthode est une transaction courte, sans réseau. */
export interface RepoRepository {
  /** NOT_FOUND si le projet n'est pas de l'organisation ou si l'installation n'est pas active. */
  plan(scope: ProjectScope, installationId: string): Promise<RepoPlan>;
  /** Insertion et audit dans la même transaction (aucun des deux sans l'autre). */
  insert(scope: ProjectScope, repo: NewRepo, action: RepoAction): Promise<InsertOutcome>;
  list(scope: ProjectScope): Promise<RepoRecord[]>;
}
