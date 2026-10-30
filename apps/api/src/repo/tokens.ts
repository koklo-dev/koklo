import type { GitProvider, GitUserCredentials } from "@koklo/domain";

/**
 * Fournisseur git injecté dans l'API (port `GitProvider` du domaine). `null` : l'App GitHub n'est
 * pas configurée (`GITHUB_APP_*` absentes) ; `repo.createSpec` et `repo.link` répondent alors
 * `PROVIDER_UNAVAILABLE`. Les tests le remplacent par le faux en mémoire (`overrideProvider`).
 */
export const GIT_PROVIDER = Symbol("GIT_PROVIDER");
export type GitProviderBinding = GitProvider | null;

/** Magasin des jetons utilisateur du fournisseur (ADR 0009), par utilisateur et installation. */
export const USER_CREDENTIALS = Symbol("USER_CREDENTIALS");

/**
 * `installationId` est l'identifiant Koklo (UUID) de la ligne `provider_installations`, pas celui
 * du fournisseur. Les identifiants portent des secrets : jamais journalisés ni sérialisés.
 */
export interface UserCredentialsStore {
  find(userId: string, installationId: string): Promise<GitUserCredentials | undefined>;
  save(userId: string, installationId: string, credentials: GitUserCredentials): Promise<void>;
}

/**
 * Adaptateur par défaut : aucun jeton utilisateur n'est conservé tant que le flux d'autorisation
 * n'existe pas. Un compte personnel obtient donc `USER_TOKEN_REQUIRED` (repli : `repo.link`).
 */
export class NoUserCredentials implements UserCredentialsStore {
  async find(): Promise<undefined> {
    return undefined;
  }

  async save(): Promise<void> {
    // Rien à conserver : voir la documentation de la classe.
  }
}
