import { withOrganization } from "@koklo/db";
import type { GitAuth, GitInstallation, GitProvider, GitUserCredentials } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { mapProviderError, type ProviderStep } from "./provider-errors.ts";
import type { InstallationRecord } from "./repo.repository.ts";
import { USER_CREDENTIALS, type UserCredentialsStore } from "./tokens.ts";

export const gitInstallationOf = (installation: InstallationRecord): GitInstallation => ({
  id: installation.externalId,
  owner: { kind: installation.ownerKind, login: installation.ownerLogin },
});

/** Un échec de l'étape donnée devient l'erreur typée du contrat, sans rien dire du fournisseur. */
export async function step<T>(name: ProviderStep, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw mapProviderError(error, name);
  }
}

/** Jetons nécessaires à la création d'un dépôt : `create` (utilisateur si disponible) puis `write`. */
export interface CreationAuth {
  create: GitAuth;
  write: GitAuth;
}

/** Authentification auprès du fournisseur pour une installation ; aucun jeton n'est conservé ici. */
@Injectable()
export class GitAccess {
  constructor(@Inject(USER_CREDENTIALS) private readonly credentials: UserCredentialsStore) {}

  /** Jeton d'installation seul : lecture d'un dépôt, commit, branche. */
  installationAuth(provider: GitProvider, installation: InstallationRecord): Promise<GitAuth> {
    return step("authenticate", () =>
      provider.authenticate({ installation: gitInstallationOf(installation) }),
    );
  }

  /**
   * Pour `createRepo` sur un compte personnel : le jeton utilisateur de l'appelant s'il en a un
   * (rafraîchi par le fournisseur, puis re-enregistré s'il a changé) ; sans lui, le port lève
   * `UserTokenRequiredError`. Le magasin est multi-tenant : ses accès s'exécutent sous
   * l'organisation de l'appelant. Le jeton utilisateur ne sert qu'à cette opération : commit et
   * branche repartent d'un jeton d'installation.
   */
  async creationAuth(
    provider: GitProvider,
    actor: { organizationId: string; userId: string },
    installation: InstallationRecord,
  ): Promise<CreationAuth> {
    const { organizationId, userId } = actor;
    const stored =
      installation.ownerKind === "user"
        ? await withOrganization(organizationId, () =>
            this.credentials.find(userId, installation.id),
          )
        : undefined;
    if (stored === undefined) {
      const auth = await this.installationAuth(provider, installation);
      return { create: auth, write: auth };
    }
    const create = await step("authenticate", () =>
      provider.authenticate({ installation: gitInstallationOf(installation), user: stored }),
    );
    await withOrganization(organizationId, () =>
      this.saveIfRenewed(userId, installation, stored, create),
    );
    return { create, write: await this.installationAuth(provider, installation) };
  }

  private async saveIfRenewed(
    userId: string,
    installation: InstallationRecord,
    stored: GitUserCredentials,
    auth: GitAuth,
  ): Promise<void> {
    if (auth.kind !== "user" || auth.token === stored.token) return;
    const { kind: _kind, ...renewed } = auth;
    await this.credentials.save(userId, installation.id, renewed);
  }
}
