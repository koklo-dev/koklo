import { InvalidRunEventError } from "./errors.ts";
import { isOneOf } from "./one-of.ts";

/** Causes de blocage typées (D3) : une par cause réelle, jamais de cause fourre-tout. */
export const BLOCK_CAUSES = [
  "dependency",
  "ambiguous_spec",
  "ci_failed",
  "conflict",
  "quota",
  "review_exhausted",
  "no_output",
  "git_error",
  "ci_timeout",
] as const;

export type BlockCause = (typeof BLOCK_CAUSES)[number];

export interface BlockDetail {
  readonly output: string;
  readonly remoteBranchExists?: boolean;
}

export interface BlockInfo {
  readonly cause: BlockCause;
  readonly detail: BlockDetail;
}

export interface BlockOptions {
  readonly remoteBranchExists?: boolean;
}

export const isBlockCause = (value: unknown): value is BlockCause => isOneOf(BLOCK_CAUSES, value);

/** Copie gelée en profondeur (le run renvoyé ne partage rien de modifiable avec l'entrée). */
export const cloneBlock = (block: BlockInfo): BlockInfo =>
  Object.freeze({ cause: block.cause, detail: Object.freeze({ ...block.detail }) });

/** Construit un blocage gelé : cause connue, sortie brute non vide, `no_output` avec `remoteBranchExists`. */
export const createBlock = (cause: unknown, output: unknown, options?: BlockOptions): BlockInfo => {
  if (!isBlockCause(cause)) throw new InvalidRunEventError("cause de blocage inconnue");
  if (typeof output !== "string" || output.trim() === "") {
    throw new InvalidRunEventError("la sortie brute du blocage est obligatoire");
  }
  if (cause !== "no_output") return cloneBlock({ cause, detail: { output } });
  if (typeof options?.remoteBranchExists !== "boolean") {
    throw new InvalidRunEventError("no_output exige remoteBranchExists");
  }
  return cloneBlock({ cause, detail: { output, remoteBranchExists: options.remoteBranchExists } });
};
