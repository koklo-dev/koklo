import type { CheckInput, CheckRun, PullRequest, PullRequestState } from "@koklo/domain";
import type { FileEntry, RepositoryState, StoredCommit, StoredPull } from "./repository-state.ts";

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

const BOT = { name: "GitHub", email: "noreply@github.com" } as const;

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
