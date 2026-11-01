export interface RotateCliIo {
  /** `DATABASE_URL`, `KOKLO_ENCRYPTION_KEY`, `KOKLO_ENCRYPTION_KEY_VERSION`, `KOKLO_ENCRYPTION_KEYS_PREVIOUS`. */
  readonly env: Record<string, string | undefined>;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

/** Codes de sortie : 0 tout est à jour, 1 au moins une ligne en échec (ou panne technique), 2 refus (usage, configuration). */
export const ROTATE_EXIT = { ok: 0, failed: 1, refused: 2 } as const;

/** Squelette du Red : le Green l'implémente. */
export async function runRotateEncryptionKey(
  _argv: readonly string[],
  _io: RotateCliIo,
): Promise<number> {
  throw new Error("runRotateEncryptionKey: non implémenté (Green TK-52c)");
}
