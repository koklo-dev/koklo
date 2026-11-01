import type { DatabaseService } from "../database/database.module.ts";
import type { KeyRingSettings } from "./key-ring.ts";

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

/**
 * Rechiffre, ligne par ligne, les deux tables chiffrées avec la clé courante du porte-clés.
 * Squelette du Red : le Green l'implémente.
 */
export async function rotateEncryptionKey(
  _database: DatabaseService,
  _settings: KeyRingSettings,
  _options: RotationOptions = {},
): Promise<RotationReport> {
  throw new Error("rotateEncryptionKey: non implémenté (Green TK-52c)");
}
