import { withOrganization } from "@koklo/db";
import type { LlmProviderId } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import { type AuditActor, recordAudit } from "../tracker/audit.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type {
  LlmCredentialRepository,
  LlmCredentialStatus,
  StoredLlmCredential,
  UpsertLlmCredential,
  UpsertResult,
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

/** Hex (24 caractères) du nonce AES-GCM de 12 octets : identifie une version de la clé stockée. */
const revisionOf = (nonce: Uint8Array): string => Buffer.from(nonce).toString("hex");

const REVISION_PATTERN = /^[0-9a-f]{24}$/;

/** Sans révision attendue, aucun filtre ; une révision mal formée ne correspond à aucune ligne. */
function revisionFilter(expected: string | undefined): { nonce?: Uint8Array<ArrayBuffer> } {
  if (expected === undefined) return {};
  const valid = REVISION_PATTERN.test(expected);
  return { nonce: new Uint8Array(valid ? Buffer.from(expected, "hex") : []) };
}

type AuditAction = "create" | "replace" | "invalidate" | "delete";

/** `audit_log` n'a pas de colonne de détail : ni fournisseur, ni modèle, ni valeur ne sont écrits. */
async function audit(
  tx: Tx,
  actor: AuditActor | undefined,
  action: AuditAction,
  targetId: string,
): Promise<void> {
  if (actor === undefined) return;
  await recordAudit(tx, actor, {
    action: `llm_credential.${action}`,
    targetKind: "llm_credential",
    targetId,
  });
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

  /** Écriture et audit dans une transaction : si l'un échoue, l'autre est annulée. */
  private transaction<T>(organizationId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.run(organizationId, () => this.database.client.$transaction(work));
  }

  upsert(
    organizationId: string,
    input: UpsertLlmCredential,
    actor?: AuditActor,
  ): Promise<UpsertResult> {
    const at = new Date(input.at);
    const sealed = {
      ciphertext: new Uint8Array(input.secret.ciphertext),
      nonce: new Uint8Array(input.secret.nonce),
      keyVersion: input.secret.keyVersion,
      defaultModel: input.defaultModel,
    };
    return this.transaction(organizationId, async (tx) => {
      const existing = await tx.llmProviderCredential.findFirst({
        where: { provider: input.provider },
        select: { id: true },
      });
      const row = await tx.llmProviderCredential.upsert({
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
      });
      const created = existing === null;
      await audit(tx, actor, created ? "create" : "replace", row.id);
      return { status: statusOf(row), created };
    });
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
        revision: revisionOf(row.nonce),
      };
    });
  }

  remove(organizationId: string, provider: LlmProviderId, actor?: AuditActor): Promise<boolean> {
    return this.transaction(organizationId, async (tx) => {
      const row = await tx.llmProviderCredential.findFirst({ where: { provider } });
      if (row === null) return false;
      const { count } = await tx.llmProviderCredential.deleteMany({ where: { id: row.id } });
      if (count === 0) return false;
      await audit(tx, actor, "delete", row.id);
      return true;
    });
  }

  invalidate(
    organizationId: string,
    provider: LlmProviderId,
    at: string,
    actor?: AuditActor,
    expectedRevision?: string,
  ): Promise<LlmCredentialStatus | null> {
    return this.transaction(organizationId, async (tx) => {
      // Idempotent : une clé déjà invalidée garde son premier `invalidated_at`, sans audit.
      // Avec une révision attendue, une clé remplacée entre-temps (autre nonce) n'est pas touchée.
      const { count } = await tx.llmProviderCredential.updateMany({
        where: { provider, invalidatedAt: null, ...revisionFilter(expectedRevision) },
        data: { invalidatedAt: new Date(at) },
      });
      const row = await tx.llmProviderCredential.findFirst({ where: { provider } });
      if (row === null) return null;
      if (count > 0) await audit(tx, actor, "invalidate", row.id);
      return statusOf(row);
    });
  }

  markUsed(organizationId: string, provider: LlmProviderId, at: string): Promise<void> {
    const instant = new Date(at);
    const threshold = new Date(instant.getTime() - MARK_USED_INTERVAL_MS);
    return this.run(organizationId, async () => {
      const row = await this.table.findFirst({
        where: { provider, OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: threshold } }] },
        select: { id: true, updatedAt: true },
      });
      if (row === null) return;
      // Utiliser une clé ne la modifie pas : `updated_at` est reposé tel quel (sinon Prisma le
      // ferait avancer) et `revision` (le nonce) ne bouge pas non plus.
      await this.table.updateMany({
        where: { id: row.id },
        data: { lastUsedAt: instant, updatedAt: row.updatedAt },
      });
    });
  }
}
