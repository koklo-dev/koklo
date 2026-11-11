import type { LlmProviderId } from "@koklo/domain";
import type { TenantClient } from "../client.ts";
import { withOrganization } from "../tenant-context.ts";

/** Ligne chiffrée d'une clé BYOK : réservée au résolveur et à la rotation, jamais exposée. */
export interface StoredCredentialRow {
  readonly id: string;
  readonly organizationId: string;
  readonly provider: LlmProviderId;
  readonly secret: {
    readonly ciphertext: Buffer;
    readonly nonce: Buffer;
    readonly keyVersion: number;
  };
  readonly defaultModel: string | null;
  readonly baseUrl: string | null;
  readonly invalidatedAt: string | null;
  /** Hex du nonce AES-GCM : neuf à chaque écriture de la clé (compare-and-swap de l'invalidation). */
  readonly revision: string;
}

/** Lecture de la clé chiffrée d'une organisation et d'un fournisseur, sous `withOrganization`. */
export class LlmCredentialLookupStore {
  constructor(private readonly client: TenantClient) {}

  find(organizationId: string, provider: LlmProviderId): Promise<StoredCredentialRow | null> {
    return withOrganization(organizationId, async () => {
      const row = await this.client.llmProviderCredential.findFirst({ where: { provider } });
      if (row === null) return null;
      return {
        id: row.id,
        organizationId: row.organizationId,
        provider: row.provider,
        secret: {
          ciphertext: Buffer.from(row.ciphertext),
          nonce: Buffer.from(row.nonce),
          keyVersion: row.keyVersion,
        },
        defaultModel: row.defaultModel,
        baseUrl: row.baseUrl,
        invalidatedAt: row.invalidatedAt?.toISOString() ?? null,
        revision: Buffer.from(row.nonce).toString("hex"),
      };
    });
  }
}
