import {
  type CheckInput,
  type CheckRun,
  type CommitAuthor,
  type FileChange,
  GitConflictError,
  GitNotFoundError,
  type PullRequest,
  type PullRequestState,
} from "@koklo/domain";
import { staleHead } from "../commit-rules.ts";
import {
  BOT,
  type FileEntry,
  type RepositoryState,
  type StoredCommit,
  type StoredPull,
  withFiles,
} from "./repository-state.ts";

/** Fusion à blanc d'une PR ouverte ; `undefined` si elle ne l'est plus. */
export const tryMerge = (state: RepositoryState, pull: StoredPull) =>
  pull.status === "open" ? state.mergeTrees(state.sha(pull.base), state.sha(pull.head)) : undefined;

/** État d'une PR tel que GitHub le rapporte : tête, fusionnabilité, checks de la tête. */
export function pullState(state: RepositoryState, pull: StoredPull): PullRequestState {
  const merge = tryMerge(state, pull);
  const headSha = state.sha(pull.head);
  return {
    ref: { repo: state.repo.ref, number: pull.number },
    status: pull.status,
    headSha,
    baseBranch: pull.base,
    headBranch: pull.head,
    mergeable: merge === undefined ? null : !("conflicts" in merge),
    ...(pull.mergedSha === undefined ? {} : { mergedSha: pull.mergedSha }),
    checks: state.checks.filter((check) => check.sha === headSha),
  };
}

export const describePull = (state: RepositoryState, pull: StoredPull): PullRequest => ({
  ...pullState(state, pull),
  title: pull.title,
  body: pull.body,
  htmlUrl: `${state.repo.htmlUrl}/pull/${pull.number}`,
});

/** Commit de fusion (squash ou merge commit), avance la base et marque la PR fusionnée. */
export function completeMerge(
  state: RepositoryState,
  pull: StoredPull,
  merge: { files: ReadonlyMap<string, FileEntry>; method: string; headSha: string },
  id: string,
): StoredCommit {
  const baseSha = state.sha(pull.base);
  const squashed = merge.method !== "merge";
  const commit = state.addCommit(
    {
      message: squashed
        ? `${pull.title} (#${pull.number})`
        : `Merge pull request #${pull.number} from ${pull.head}`,
      author: BOT,
      parents: squashed ? [baseSha] : [baseSha, merge.headSha],
      files: merge.files,
    },
    id,
  );
  state.branches.set(pull.base, commit.sha);
  pull.status = "merged";
  pull.mergedSha = commit.sha;
  return commit;
}

/** Check-run tel que le port le rend : seuls les champs fournis sont présents. */
export const toStoredCheck = (sha: string, check: CheckInput): CheckRun => ({
  name: check.name,
  sha,
  status: check.status,
  ...(check.conclusion === undefined ? {} : { conclusion: check.conclusion }),
  ...(check.detailsUrl === undefined ? {} : { detailsUrl: check.detailsUrl }),
  ...(check.summary === undefined ? {} : { summary: check.summary }),
});

/**
 * Fusion demandée : tête périmée ou non fusionnable -> raison du refus ; sinon le commit de fusion.
 * Le faux traduit la raison en `GitConflictError`.
 */
export function mergeOutcome(
  state: RepositoryState,
  pull: StoredPull,
  request: { method: string; expectedHeadSha: string },
  id: string,
): { reason: "stale-sha" | "not-mergeable" } | { sha: string } {
  const headSha = state.sha(pull.head);
  if (headSha !== request.expectedHeadSha) return { reason: "stale-sha" };
  const merge = tryMerge(state, pull);
  if (merge === undefined || "conflicts" in merge) return { reason: "not-mergeable" };
  const { files } = merge;
  return { sha: completeMerge(state, pull, { files, method: request.method, headSha }, id).sha };
}

/** Ouvre une PR sur l'état ; refuse un doublon (même base et même tête déjà ouvertes). */
export function openPull(
  state: RepositoryState,
  input: Pick<StoredPull, "base" | "head" | "title" | "body">,
): StoredPull {
  const { base, head } = input;
  const open = state.pulls.find((p) => p.status === "open" && p.base === base && p.head === head);
  if (open !== undefined) {
    throw new GitConflictError({
      operation: "createPullRequest",
      reason: "exists",
      identifier: `${state.repo.ref.owner.login}/${state.repo.ref.name}: ${head} -> ${base}`,
    });
  }
  const pull: StoredPull = { number: state.pulls.length + 1, ...input, status: "open" };
  state.pulls.push(pull);
  return pull;
}

/** Enregistre un check, en remplaçant celui du même nom sur le même commit. */
export function recordCheck(state: RepositoryState, sha: string, check: CheckInput): CheckRun {
  const run = toStoredCheck(sha, check);
  const previous = state.checks.findIndex((c) => c.name === run.name && c.sha === sha);
  if (previous >= 0) state.checks[previous] = run;
  else state.checks.push(run);
  return run;
}

/** Écrit un commit en tête de `branch` ; refuse une branche inconnue ou une tête qui a bougé. */
export function writeOnBranch(
  state: RepositoryState,
  input: {
    branch: string;
    files: readonly FileChange[];
    author: CommitAuthor;
    message: string;
    expectedHeadSha?: string | undefined;
  },
  id: string,
): StoredCommit {
  const { branch, files, author, message, expectedHeadSha } = input;
  const label = `${state.repo.ref.owner.login}/${state.repo.ref.name}@${branch}`;
  const head = state.branches.get(branch);
  if (head === undefined) {
    throw new GitNotFoundError({ operation: "writeCommit", resource: "branch", identifier: label });
  }
  if (expectedHeadSha !== undefined && expectedHeadSha !== head) throw staleHead(label);
  const commit = state.addCommit(
    { message, author, parents: [head], files: withFiles(state.commit(head).files, files) },
    id,
  );
  state.branches.set(branch, commit.sha);
  return commit;
}
