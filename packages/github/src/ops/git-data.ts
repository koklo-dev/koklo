import type { Branch, Commit, FileChange, GitAuth, RepoRef, Tag } from "@koklo/domain";
import { WRITE } from "../client.ts";
import { staleHead } from "../commit-rules.ts";
import type { Gateway } from "../gateway.ts";
import { type Request, repoId, resolveCommitSha, target } from "./shared.ts";

/** Suppression = entrée d'arbre sans contenu (`sha: null`) ; écriture = blob créé en ligne. */
const treeEntry = (file: FileChange) =>
  file.delete === true
    ? { path: file.path, mode: "100644" as const, type: "blob" as const, sha: null }
    : {
        path: file.path,
        mode: file.mode ?? ("100644" as const),
        type: "blob" as const,
        content: file.content,
      };

/**
 * Un seul commit atomique pour N fichiers (API Git Data) : tête de branche, arbre, commit, puis
 * mise à jour de la référence SANS `force` (une branche qui a bougé est un conflit, jamais écrasée).
 */
export function writeCommit(gw: Gateway, request: Request<"writeCommit">): Promise<Commit> {
  const { auth, repo, branch, files, author, message, expectedHeadSha } = request;
  const operation = {
    operation: "writeCommit",
    resource: "branch",
    identifier: `${repoId(repo)}@${branch}`,
  };
  const ref = `heads/${branch}`;
  return gw.withAuth(operation, auth, async (octokit) => {
    const head = await octokit.request("GET /repos/{owner}/{repo}/git/ref/{+ref}", {
      ...target(repo),
      ref,
    });
    const headSha = (head.data as { object: { sha: string } }).object.sha;
    if (expectedHeadSha !== undefined && expectedHeadSha !== headSha) {
      throw staleHead(operation.identifier);
    }
    const parent = await octokit.rest.git.getCommit({ ...target(repo), commit_sha: headSha });
    const tree = await octokit.rest.git.createTree({
      ...target(repo),
      base_tree: parent.data.tree.sha,
      tree: files.map(treeEntry),
      ...WRITE,
    });
    const commit = await octokit.rest.git.createCommit({
      ...target(repo),
      message,
      tree: tree.data.sha,
      parents: [headSha],
      author: { ...author, date: gw.now().toISOString() },
      ...WRITE,
    });
    await octokit.request("PATCH /repos/{owner}/{repo}/git/refs/{+ref}", {
      ...target(repo),
      ref,
      sha: commit.data.sha,
      force: false,
      ...WRITE,
    });
    return {
      sha: commit.data.sha,
      message,
      author,
      parents: commit.data.parents.map((parentCommit) => parentCommit.sha),
    };
  });
}

type NewRef = {
  readonly operation: "createBranch" | "createTag";
  readonly prefix: "heads" | "tags";
  readonly request: { auth: GitAuth; repo: RepoRef; base: string; name: string };
};

/** Crée `refs/heads/{name}` ou `refs/tags/{name}` sur le commit désigné par `base`. */
function createRef(gw: Gateway, { operation, prefix, request }: NewRef) {
  const { auth, repo, base, name } = request;
  const description = {
    operation,
    resource: "ref",
    identifier: `${repoId(repo)}: ${base} -> ${name}`,
  };
  return gw.withAuth(description, auth, async (octokit) => {
    const commitSha = await resolveCommitSha(octokit, repo, base);
    await octokit.rest.git.createRef({
      ...target(repo),
      ref: `refs/${prefix}/${name}`,
      sha: commitSha,
      ...WRITE,
    });
    return { name, sha: commitSha };
  });
}

export const createBranch = (gw: Gateway, request: Request<"createBranch">): Promise<Branch> =>
  createRef(gw, { operation: "createBranch", prefix: "heads", request });

/** Tag léger : le port n'a pas de message de tag (la release est faite par Release Please). */
export const createTag = (gw: Gateway, request: Request<"createTag">): Promise<Tag> =>
  createRef(gw, {
    operation: "createTag",
    prefix: "tags",
    request: { auth: request.auth, repo: request.repo, base: request.ref, name: request.name },
  });
