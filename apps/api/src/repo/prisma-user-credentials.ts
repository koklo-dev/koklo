import { currentOrganizationId, MissingOrganizationContextError } from "@koklo/db";
import type { GitUserCredentials } from "@koklo/domain";
import {
  type EncryptedSecret,
  type TokenCipher,
  TokenDecryptionError,
} from "../crypto/token-cipher.ts";
import type { DatabaseService } from "../database/database.module.ts";
import type { UserCredentialsStore } from "./tokens.ts";

/** Part secrète des identifiants : seule elle est chiffrée, les échéances restent lisibles en base. */
type SecretPart = { token: string; refreshToken?: string };

/** Les données associées lient le chiffré à son utilisateur et à son installation. */
const aadOf = (userId: string, installationId: string) => `${userId}:${installationId}`;

/** Le clair a passé l'authentification GCM : s'il n'a pas la forme écrite, c'est une corruption. Aucune citation du contenu. */
function parseSecretPart(plaintext: string): SecretPart {
  try {
    const part = JSON.parse(plaintext) as Partial<SecretPart> | null;
    if (typeof part?.token === "string") return part as SecretPart;
  } catch {
    // SyntaxError écartée : son message cite le début du clair.
  }
  throw new TokenDecryptionError();
}

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
    const secret: EncryptedSecret = {
      ciphertext: Buffer.from(row.ciphertext),
      nonce: Buffer.from(row.nonce),
      keyVersion: row.keyVersion,
    };
    const { token, refreshToken } = parseSecretPart(
      this.cipher.decrypt(secret, aadOf(userId, installationId)),
    );
    return {
      token,
      expiresAt: row.expiresAt.toISOString(),
      ...(refreshToken === undefined ? {} : { refreshToken }),
      ...(row.refreshExpiresAt === null
        ? {}
        : { refreshExpiresAt: row.refreshExpiresAt.toISOString() }),
    };
  }

  async save(
    userId: string,
    installationId: string,
    credentials: GitUserCredentials,
  ): Promise<void> {
    const organizationId = currentOrganizationId();
    if (!organizationId) {
      throw new MissingOrganizationContextError("Tenant model accessed outside withOrganization");
    }
    const part: SecretPart = {
      token: credentials.token,
      ...(credentials.refreshToken === undefined ? {} : { refreshToken: credentials.refreshToken }),
    };
    const sealed = this.cipher.encrypt(JSON.stringify(part), aadOf(userId, installationId));
    const data = {
      ciphertext: new Uint8Array(sealed.ciphertext),
      nonce: new Uint8Array(sealed.nonce),
      keyVersion: sealed.keyVersion,
      expiresAt: new Date(credentials.expiresAt),
      refreshExpiresAt:
        credentials.refreshExpiresAt === undefined ? null : new Date(credentials.refreshExpiresAt),
    };
    await this.database.client.providerUserCredential.upsert({
      where: { userId_installationId: { userId, installationId } },
      create: { organizationId, userId, installationId, ...data },
      update: data,
    });
  }
}
