import type { DatabaseService } from "../database/database.module.ts";
import { llmCredentialAad } from "../llm-credential/llm-credential-aad.ts";
import { LlmCredentialStoreError } from "../llm-credential/llm-credential-errors.ts";
import type { EncryptedSecret } from "./token-cipher.ts";

export type RotationTableKey = "llm" | "userTokens";

/** Une ligne chiffrée à rotationner ; l'AAD est dérivée de ses colonnes, jamais stockée. */
export interface RotationRow {
  readonly id: string;
  readonly aad: string;
  readonly secret: EncryptedSecret;
}

/** Erreur de base sur la table des jetons : assainie, sans cause ni message du driver. */
export class RotationStoreError extends Error {
  constructor() {
    super("Échec de l'écriture d'une ligne chiffrée pendant la rotation");
    this.name = "RotationStoreError";
  }
}

/** Accès à une table chiffrée : lecture des lignes pas à jour, écriture avec compare-and-swap. */
export interface RotationTable {
  readonly key: RotationTableKey;
  /** Erreur assainie à lever pour toute erreur de base sur cette table. */
  readonly storeError: () => Error;
  countCurrent(version: number): Promise<number>;
  /** Lignes dont `key_version` diffère de `version`, de toutes les organisations. */
  listOutdated(version: number): Promise<RotationRow[]>;
  /** Vrai si la ligne a été réécrite ; faux si elle avait changé entre-temps (rien d'écrit). */
  swap(row: RotationRow, next: EncryptedSecret, at: Date): Promise<boolean>;
}

const bytes = (buffer: Buffer) => new Uint8Array(buffer);
const secretOf = (row: { ciphertext: Uint8Array; nonce: Uint8Array; keyVersion: number }) => ({
  ciphertext: Buffer.from(row.ciphertext),
  nonce: Buffer.from(row.nonce),
  keyVersion: row.keyVersion,
});
/** Le CAS porte sur la version, le chiffré et le nonce lus : toute écriture normale l'invalide. */
const casWhere = (row: RotationRow) => ({
  id: row.id,
  keyVersion: row.secret.keyVersion,
  ciphertext: bytes(row.secret.ciphertext),
  nonce: bytes(row.secret.nonce),
});
const casData = (next: EncryptedSecret, at: Date) => ({
  ciphertext: bytes(next.ciphertext),
  nonce: bytes(next.nonce),
  keyVersion: next.keyVersion,
  updatedAt: at,
});

/**
 * Passe par le client brut : la commande d'administration parcourt toutes les organisations, hors
 * de toute requête HTTP (dérogation à la règle de `DatabaseService`, bornée à ces deux tables).
 */
export function llmTable(database: DatabaseService): RotationTable {
  const table = database.raw.llmProviderCredential;
  return {
    key: "llm",
    storeError: () => new LlmCredentialStoreError(),
    countCurrent: (version) => table.count({ where: { keyVersion: version } }),
    async listOutdated(version) {
      const rows = await table.findMany({
        where: { keyVersion: { not: version } },
        orderBy: { id: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        aad: llmCredentialAad(row.organizationId, row.provider),
        secret: secretOf(row),
      }));
    },
    async swap(row, next, at) {
      const { count } = await table.updateMany({ where: casWhere(row), data: casData(next, at) });
      return count > 0;
    },
  };
}

export function userTokensTable(database: DatabaseService): RotationTable {
  const table = database.raw.providerUserCredential;
  return {
    key: "userTokens",
    storeError: () => new RotationStoreError(),
    countCurrent: (version) => table.count({ where: { keyVersion: version } }),
    async listOutdated(version) {
      const rows = await table.findMany({
        where: { keyVersion: { not: version } },
        orderBy: { id: "asc" },
      });
      // Mêmes données associées que `PrismaUserCredentials` (ADR 0009).
      return rows.map((row) => ({
        id: row.id,
        aad: `${row.userId}:${row.installationId}`,
        secret: secretOf(row),
      }));
    },
    async swap(row, next, at) {
      const { count } = await table.updateMany({ where: casWhere(row), data: casData(next, at) });
      return count > 0;
    },
  };
}
