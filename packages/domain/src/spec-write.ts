import type { CommitAuthor } from "./git-repo.ts";

/**
 * Règles partagées par l'API (qui enfile un lot d'écriture de la spec) et le worker (qui le
 * commit) : file, auteur du bot, codes d'erreur d'un lot et validation des noms qui finissent
 * dans une requête au fournisseur git. Pures, sans I/O.
 */

/** File pg-boss du worker ; l'API y dépose `{ batchId }` seul. */
export const SPEC_WRITE_QUEUE = "spec-write";

/** Clé de sérialisation : un seul lot à la fois par branche d'un dépôt (`key_strict_fifo`). */
export const specWriteSingletonKey = (repoId: string, branch: string): string =>
  `${repoId}:${branch}`;

/** Auteur de tout commit de lot ; l'utilisateur de la session figure au trailer `Co-authored-by`. */
export const KOKLO_BOT_AUTHOR: CommitAuthor = Object.freeze({
  name: "Koklo",
  email: "koklo-bot@users.noreply.invalid",
});

/** Branche de travail d'un projet tant que `baseline-0` n'est pas posée. */
export const SCOPING_BRANCH = "cadrage";

/** `error_code` d'un lot terminé en échec ou en conflit : liste fermée, jamais un message brut. */
export const SPEC_BATCH_ERROR_CODES = Object.freeze([
  "SPEC_INVALID",
  "FORBIDDEN",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_AUTH_EXPIRED",
  "PROVIDER_RATE_LIMITED",
  "INTERNAL",
  "stale_base",
  "write_conflict",
] as const);
export type SpecBatchErrorCode = (typeof SPEC_BATCH_ERROR_CODES)[number];

const FEATURE_ID = /^F-\d{3,}$/;
const FORBIDDEN_REF_CHARS = /[\s~^:?*[\\]/;
const MAX_BRANCH_LENGTH = 200;

const hasControlCharacter = (text: string): boolean =>
  [...text].some((char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });

export const isFeatureId = (value: unknown): value is string =>
  typeof value === "string" && FEATURE_ID.test(value);

/** Nom de branche acceptable (sous-ensemble prudent de `git check-ref-format`). */
export function isValidBranchName(name: unknown): name is string {
  if (typeof name !== "string" || name === "" || name === "@") return false;
  if (name.length > MAX_BRANCH_LENGTH || FORBIDDEN_REF_CHARS.test(name)) return false;
  if (hasControlCharacter(name)) return false;
  if (name.includes("..") || name.includes("@{") || name.endsWith(".")) return false;
  return name
    .split("/")
    .every((segment) => segment !== "" && !segment.startsWith(".") && !segment.endsWith(".lock"));
}

/** Dossier relatif de la spec dans un monorepo : ni absolu, ni `.`/`..`/`.git`, ni segment vide. */
export function isSafeSpecPath(path: unknown): path is string {
  if (typeof path !== "string" || path === "" || path.includes("\\")) return false;
  if (hasControlCharacter(path)) return false;
  return path
    .split("/")
    .every(
      (segment) =>
        segment !== "" && segment !== "." && segment !== ".." && segment.toLowerCase() !== ".git",
    );
}
