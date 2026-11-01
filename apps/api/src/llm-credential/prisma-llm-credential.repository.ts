import { withOrganization } from "@koklo/db";
import type { LlmProviderId } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import type {
  LlmCredentialRepository,
  LlmCredentialStatus,
  StoredLlmCredential,
  UpsertLlmCredential,
} from "./llm-credential.repository.ts";
import { LlmCredentialStoreError } from "./llm-credential-errors.ts";

/** `last_used_at` n'est réécrit qu'une fois par minute au plus. */
const MARK_USED_INTERVAL_MS = 60_000;

interface Row {
  id: string;
  provider: LlmProviderId;
  defaultModel: string | null;
  invalidatedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Statut public : aucune colonne secrète (chiffré, nonce, version de clé) n'est copiée. */
function statusOf(row: Row): LlmCredentialStatus {
  return {
    id: row.id,
    provider: row.provider,
    defaultModel: row.defaultModel,
    invalid: row.invalidatedAt !== null,
    invalidatedAt: row.invalidatedAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Magasin Prisma des clés BYOK (chiffrées avant d'arriver ici). Toute erreur de la base est
 * remplacée par `LlmCredentialStoreError`, sans cause : une violation de CHECK de Prisma cite la
 * ligne fautive, chiffré compris (« Failing row contains (… \x… ) »).
 */
@Injectable()
export class PrismaLlmCredentialRepository implements LlmCredentialRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private async run<T>(organizationId: string, work: () => Promise<T>): Promise<T> {
    try {
      return await withOrganization(organizationId, work);
    } catch {
      throw new LlmCredentialStoreError();
    }
  }

  private get table() {
    return this.database.client.llmProviderCredential;
  }

  upsert(organizationId: string, input: UpsertLlmCredential): Promise<LlmCredentialStatus> {
    const at = new Date(input.at);
    const sealed = {
      ciphertext: new Uint8Array(input.secret.ciphertext),
      nonce: new Uint8Array(input.secret.nonce),
      keyVersion: input.secret.keyVersion,
      defaultModel: input.defaultModel,
    };
    return this.run(organizationId, async () =>
      statusOf(
        await this.table.upsert({
          where: { organizationId_provider: { organizationId, provider: input.provider } },
          create: {
            organizationId,
            provider: input.provider,
            ...sealed,
            createdByUserId: input.createdByUserId,
            createdAt: at,
            updatedAt: at,
          },
          // Remplacement en place : même id et même `createdAt`, la clé est ré-armée.
          update: { ...sealed, invalidatedAt: null, lastUsedAt: null, updatedAt: at },
        }),
      ),
    );
  }

  list(organizationId: string): Promise<LlmCredentialStatus[]> {
    return this.run(organizationId, async () =>
      (await this.table.findMany({ orderBy: { provider: "asc" } })).map(statusOf),
    );
  }

  find(organizationId: string, provider: LlmProviderId): Promise<StoredLlmCredential | null> {
    return this.run(organizationId, async () => {
      const row = await this.table.findFirst({ where: { provider } });
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
        invalidatedAt: row.invalidatedAt?.toISOString() ?? null,
      };
    });
  }

  remove(organizationId: string, provider: LlmProviderId): Promise<boolean> {
    return this.run(
      organizationId,
      async () => (await this.table.deleteMany({ where: { provider } })).count > 0,
    );
  }

  invalidate(
    organizationId: string,
    provider: LlmProviderId,
    at: string,
  ): Promise<LlmCredentialStatus | null> {
    return this.run(organizationId, async () => {
      // Idempotent : une clé déjà invalidée garde son premier `invalidated_at`.
      await this.table.updateMany({
        where: { provider, invalidatedAt: null },
        data: { invalidatedAt: new Date(at) },
      });
      const row = await this.table.findFirst({ where: { provider } });
      return row === null ? null : statusOf(row);
    });
  }

  markUsed(organizationId: string, provider: LlmProviderId, at: string): Promise<void> {
    const instant = new Date(at);
    const threshold = new Date(instant.getTime() - MARK_USED_INTERVAL_MS);
    return this.run(organizationId, async () => {
      await this.table.updateMany({
        where: { provider, OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: threshold } }] },
        data: { lastUsedAt: instant },
      });
    });
  }
}
