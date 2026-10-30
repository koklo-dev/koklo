import type { GitProvider, PullRequestRef, RepoRef } from "@koklo/domain";
import type { GitHubOctokit } from "../client.ts";

/** Paramètre d'une opération du port. */
export type Request<K extends keyof GitProvider> = Parameters<GitProvider[K]>[0];

export const repoId = (repo: RepoRef): string => `${repo.owner.login}/${repo.name}`;
export const pullId = (pull: PullRequestRef): string => `${repoId(pull.repo)}#${pull.number}`;

/** Paramètres `owner`/`repo` d'un appel REST. */
export const target = (repo: RepoRef) => ({ owner: repo.owner.login, repo: repo.name });

const FULL_SHA = /^[0-9a-f]{40}$/i;

/**
 * Résout une branche, un tag ou un SHA en SHA de commit. `{+ref}` laisse passer les `/` des
 * noms de branche (`feat/x`).
 */
export async function resolveCommitSha(
  octokit: GitHubOctokit,
  repo: RepoRef,
  ref: string,
): Promise<string> {
  if (FULL_SHA.test(ref)) return ref;
  const response = await octokit.request("GET /repos/{owner}/{repo}/commits/{+ref}", {
    ...target(repo),
    ref,
  });
  return (response.data as { sha: string }).sha;
}
