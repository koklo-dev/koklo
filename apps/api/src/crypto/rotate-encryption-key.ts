import type { DatabaseService } from "../database/database.module.ts";
import { createKeyRing, type KeyRingSettings } from "./key-ring.ts";
import {
  llmTable,
  type RotationTable,
  type RotationTableKey,
  userTokensTable,
} from "./rotation-tables.ts";
import { type TokenCipher, TokenDecryptionError } from "./token-cipher.ts";

/** Comptes d'une table ; jamais de valeur, de clé ni d'identifiant. */
export interface TableRotationReport {
  /** Lignes lues. */
  readonly scanned: number;
  /** Lignes réécrites en version courante (avec `dryRun` : lignes qui le SERAIENT). */
  readonly rotated: number;
  /** Lignes déjà en version courante, non touchées. */
  readonly alreadyCurrent: number;
  /** Lignes illisibles ou dont l'écriture a échoué : laissées intactes. */
  readonly failed: number;
  /** Lignes réécrites entre-temps par une écriture normale : laissées telles quelles, pas d'échec. */
  readonly conflicts: number;
}

export interface RotationReport {
  readonly dryRun: boolean;
  /** `llm_provider_credentials`. */
  readonly llm: TableRotationReport;
  /** `provider_user_credentials`. */
  readonly userTokens: TableRotationReport;
}

export interface RotationOptions {
  readonly dryRun?: boolean;
  /** Une ligne de journal par appel : comptes uniquement. */
  readonly log?: (line: string) => void;
  /** Point d'injection de test : appelé après lecture et déchiffrement, avant l'écriture de chaque ligne. */
  readonly beforeWrite?: (table: "llm" | "userTokens") => Promise<void>;
  /**
   * Point d'observation : l'erreur déjà assainie d'une ligne en échec (`LlmCredentialStoreError`
   * pour une erreur de base sur la table BYOK, `TokenDecryptionError` pour un chiffré illisible).
   * Jamais l'erreur brute du driver.
   */
  readonly onFailure?: (table: "llm" | "userTokens", error: Error) => void;
}

/** Configuration refusée avant toute écriture ; le message ne cite jamais une clé. */
export class RotationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RotationConfigError";
  }
}

const empty = (): TableRotationReport => ({
  scanned: 0,
  rotated: 0,
  alreadyCurrent: 0,
  failed: 0,
  conflicts: 0,
});

type Counts = { -readonly [K in keyof TableRotationReport]: TableRotationReport[K] };

async function rotateRows(
  table: RotationTable,
  cipher: TokenCipher,
  options: RotationOptions,
): Promise<Counts> {
  const counts: Counts = empty();
  const rows = await table.listOutdated(cipher.keyVersion);
  counts.alreadyCurrent = await table.countCurrent(cipher.keyVersion);
  counts.scanned = rows.length + counts.alreadyCurrent;
  for (const row of rows) {
    try {
      // Un chiffré illisible lève ici `TokenDecryptionError` : la ligne reste intacte.
      const next = cipher.encrypt(cipher.decrypt(row.secret, row.aad), row.aad);
      if (options.dryRun !== true) {
        await options.beforeWrite?.(table.key);
        if (!(await table.swap(row, next, new Date()))) {
          counts.conflicts += 1;
          continue;
        }
      }
      counts.rotated += 1;
    } catch (error) {
      counts.failed += 1;
      // Seule l'erreur assainie sort : jamais celle du driver, qui peut citer la ligne.
      options.onFailure?.(
        table.key,
        error instanceof TokenDecryptionError ? error : table.storeError(),
      );
    }
  }
  return counts;
}

const describe = (key: RotationTableKey, c: TableRotationReport, dryRun: boolean) =>
  `${key}: ${c.scanned} lues, ${c.rotated} ${dryRun ? "à réécrire (essai)" : "réécrites"}, ${c.alreadyCurrent} à jour, ${c.failed} en échec, ${c.conflicts} en conflit`;

/**
 * Rechiffre, ligne par ligne, les deux tables chiffrées avec la clé courante du porte-clés. Idempotent
 * (les lignes à la version courante ne sont pas touchées), atomique par ligne (une instruction avec
 * compare-and-swap), sans audit. Refuse, sans rien écrire, une configuration incohérente
 * (`KeyRingConfigError`) ou des lignes anciennes sans aucune clé précédente (`RotationConfigError`).
 */
export async function rotateEncryptionKey(
  database: DatabaseService,
  settings: KeyRingSettings,
  options: RotationOptions = {},
): Promise<RotationReport> {
  const cipher = createKeyRing(settings);
  const tables = [llmTable(database), userTokensTable(database)] as const;
  if (settings.previous.length === 0) {
    for (const table of tables) {
      if ((await table.listOutdated(cipher.keyVersion)).length > 0) {
        throw new RotationConfigError(
          "Des lignes chiffrées ne sont pas en version courante : configurer KOKLO_ENCRYPTION_KEYS_PREVIOUS",
        );
      }
    }
  }
  const dryRun = options.dryRun === true;
  const [llm, userTokens] = [
    await rotateRows(tables[0], cipher, options),
    await rotateRows(tables[1], cipher, options),
  ];
  options.log?.(describe("llm", llm, dryRun));
  options.log?.(describe("userTokens", userTokens, dryRun));
  return { dryRun, llm, userTokens };
}
