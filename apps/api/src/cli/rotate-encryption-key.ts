import { KeyRingConfigError, type KeyRingSettings } from "../crypto/key-ring.ts";
import { keyRingFromEnv } from "../crypto/key-ring-config.ts";
import {
  RotationConfigError,
  type RotationReport,
  rotateEncryptionKey,
} from "../crypto/rotate-encryption-key.ts";
import { InvalidEncryptionKeyError, parseEncryptionKey } from "../crypto/token-cipher.ts";
import { DatabaseService } from "../database/database.module.ts";

export interface RotateCliIo {
  /** `DATABASE_URL`, `KOKLO_ENCRYPTION_KEY`, `KOKLO_ENCRYPTION_KEY_VERSION`, `KOKLO_ENCRYPTION_KEYS_PREVIOUS`. */
  readonly env: Record<string, string | undefined>;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

/** Codes de sortie : 0 tout est à jour, 1 au moins une ligne en échec (ou panne technique), 2 refus (usage, configuration). */
export const ROTATE_EXIT = { ok: 0, failed: 1, refused: 2 } as const;

/** Refus de l'usage ou de la configuration : le message ne cite jamais une valeur. */
class RotateRefusal extends Error {}

const USAGE = "usage : rotate:encryption-key [--dry-run] [--json]";

function parseArgs(argv: readonly string[]): { dryRun: boolean; json: boolean } {
  const flags = new Set<string>();
  for (const arg of argv) {
    if (arg !== "--dry-run" && arg !== "--json") throw new RotateRefusal(USAGE);
    flags.add(arg);
  }
  return { dryRun: flags.has("--dry-run"), json: flags.has("--json") };
}

const present = (value: string | undefined) =>
  value === undefined || value === "" ? undefined : value;

function readSettings(env: RotateCliIo["env"]): { databaseUrl: string; settings: KeyRingSettings } {
  const databaseUrl = present(env.DATABASE_URL);
  if (databaseUrl === undefined)
    throw new RotateRefusal("Configuration invalide (DATABASE_URL: requise)");
  const rawKey = present(env.KOKLO_ENCRYPTION_KEY);
  if (rawKey === undefined) {
    throw new RotateRefusal("Configuration invalide (KOKLO_ENCRYPTION_KEY: requise)");
  }
  let key: Buffer;
  try {
    key = parseEncryptionKey(rawKey);
  } catch (error) {
    if (!(error instanceof InvalidEncryptionKeyError)) throw error;
    throw new RotateRefusal(
      "Configuration invalide (KOKLO_ENCRYPTION_KEY: 32 octets en base64 attendus, ou 32 caractères alphanumériques)",
    );
  }
  try {
    const settings = keyRingFromEnv(
      key,
      present(env.KOKLO_ENCRYPTION_KEY_VERSION),
      present(env.KOKLO_ENCRYPTION_KEYS_PREVIOUS),
    );
    return { databaseUrl, settings: settings as KeyRingSettings };
  } catch (error) {
    throw new RotateRefusal(error instanceof Error ? error.message : "Configuration invalide");
  }
}

function formatReport(report: RotationReport): string {
  const row = (label: string, c: RotationReport["llm"]) =>
    `${label} : ${c.scanned} lues, ${c.rotated} ${report.dryRun ? "à réécrire" : "réécrites"}, ${c.alreadyCurrent} à jour, ${c.failed} en échec, ${c.conflicts} en conflit`;
  return [
    report.dryRun
      ? "Rotation de la clé maître (essai, dry-run : rien n'est écrit)"
      : "Rotation de la clé maître",
    row("Clés BYOK (llm_provider_credentials)", report.llm),
    row("Jetons utilisateur (provider_user_credentials)", report.userTokens),
    "",
  ].join("\n");
}

async function execute(argv: readonly string[], io: RotateCliIo): Promise<number> {
  const args = parseArgs(argv);
  const { databaseUrl, settings } = readSettings(io.env);
  const database = new DatabaseService({ databaseUrl });
  try {
    const report = await rotateEncryptionKey(database, settings, { dryRun: args.dryRun });
    io.stdout(args.json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report));
    return report.llm.failed + report.userTokens.failed > 0 ? ROTATE_EXIT.failed : ROTATE_EXIT.ok;
  } finally {
    await database.onModuleDestroy();
  }
}

/**
 * Commande d'administration `rotate:encryption-key` : rechiffre les clés BYOK et les jetons
 * utilisateur avec la clé courante. Jamais exposée en HTTP. La sortie ne porte que des comptes ;
 * les refus vont sur l'erreur standard, sans valeur ni message du driver.
 */
export async function runRotateEncryptionKey(
  argv: readonly string[],
  io: RotateCliIo,
): Promise<number> {
  try {
    return await execute(argv, io);
  } catch (error) {
    if (
      error instanceof RotateRefusal ||
      error instanceof RotationConfigError ||
      error instanceof KeyRingConfigError
    ) {
      io.stderr(`${error.message}\n`);
      return ROTATE_EXIT.refused;
    }
    // Message du driver écarté : il peut citer l'URL de la base ou une ligne.
    io.stderr("Échec technique de la rotation (base injoignable ou erreur inattendue)\n");
    return ROTATE_EXIT.failed;
  }
}
