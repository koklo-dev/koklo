import { currentOrganizationId, MissingOrganizationContextError } from "@koklo/db";
import type { GitUserCredentials } from "@koklo/domain";
import { openUserCredentials, sealUserCredentials, type TokenCipher } from "@koklo/github";
import type { DatabaseService } from "../database/database.module.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { UserCredentialsStore } from "./tokens.ts";

/**
 * Magasin des jetons utilisateur : chiffrés (AES-256-GCM) avant d'atteindre la base, isolés par
 * organisation (client multi-tenant, sous `withOrganization`). Un enregistrement illisible lève
 * `TokenDecryptionError` : le rendre absent masquerait la corruption.
 */
export class PrismaUserCredentials implements UserCredentialsStore {
  constructor(
    private readonly database: DatabaseService,
    private readonly cipher: TokenCipher,
  ) {}

  async find(userId: string, installationId: string): Promise<GitUserCredentials | undefined> {
    const row = await this.database.client.providerUserCredential.findFirst({
      where: { userId, installationId },
    });
    if (row === null) return undefined;
    return openUserCredentials(this.cipher, userId, installationId, row);
  }

  async save(
    userId: string,
    installationId: string,
    credentials: GitUserCredentials,
    tx?: Tx,
  ): Promise<void> {
    const organizationId = currentOrganizationId();
    if (!organizationId) {
      throw new MissingOrganizationContextError("Tenant model accessed outside withOrganization");
    }
    const data = sealUserCredentials(this.cipher, userId, installationId, credentials);
    await (tx ?? this.database.client).providerUserCredential.upsert({
      where: { userId_installationId: { userId, installationId } },
      create: { organizationId, userId, installationId, ...data },
      update: data,
    });
  }
}
