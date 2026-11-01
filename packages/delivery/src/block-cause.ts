/** SQUELETTE (TK-72 lot 1, étape RED). */
export type BlockCause =
  | "dependency"
  | "ambiguous_spec"
  | "ci_failed"
  | "conflict"
  | "quota"
  | "review_exhausted"
  | "no_output"
  | "git_error"
  | "ci_timeout";

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

export const BLOCK_CAUSES: readonly BlockCause[] = [];

export const isBlockCause = (_value: unknown): _value is BlockCause => false;

export const createBlock = (
  _cause: unknown,
  _output: unknown,
  _options?: BlockOptions,
): BlockInfo => {
  throw new Error("not implemented");
};
