import {
  type Commit,
  type FileContent,
  type FileListing,
  GitNotFoundError,
  GitProviderError,
  type Repo,
  UserTokenRequiredError,
} from "@koklo/domain";
import { WRITE } from "../client.ts";
import { byPath, commitLimit } from "../commit-rules.ts";
import type { Gateway } from "../gateway.ts";
import { type ApiListedCommit, type ApiRepo, toListedCommit, toRepo } from "../mappers.ts";
import { type Request, repoId, resolveCommitSha, target } from "./shared.ts";

/**
 * Un compte personnel exige un jeton utilisateur (ADR 0009) : refus local, sans appel réseau.
 * Organisation : `/orgs/{org}/repos` ; utilisateur : `/user/repos` ; modèle : `/generate`.
 */
export async function createRepo(gw: Gateway, request: Request<"createRepo">): Promise<Repo> {
  const { auth, owner, name, visibility, template } = request;
  const operation = {
    operation: "createRepo",
    resource: "repository",
    identifier: `${owner.login}/${name}`,
    owner,
  };
  if (owner.kind === "user" && auth.kind !== "user") {
    throw new UserTokenRequiredError({ operation: "createRepo", owner });
  }
  const isPrivate = visibility === "private";
  return gw.withAuth(operation, auth, async (octokit) => {
    if (template !== undefined) {
      const generated = await octokit.rest.repos.createUsingTemplate({
        template_owner: template.owner.login,
        template_repo: template.name,
        owner: owner.login,
        name,
        private: isPrivate,
        ...WRITE,
      });
      return toRepo(generated.data as ApiRepo);
    }
    const params = { name, private: isPrivate, auto_init: true, ...WRITE };
    const created =
      owner.kind === "organization"
        ? await octokit.rest.repos.createInOrg({ org: owner.login, ...params })
        : await octokit.rest.repos.createForAuthenticatedUser(params);
    return toRepo(created.data as ApiRepo);
  });
}

/** Lit un dépôt avec le jeton fourni ; 404 (absent ou hors installation) : `GitNotFoundError`. */
export function getRepo(gw: Gateway, request: Request<"getRepo">): Promise<Repo> {
  const { auth, repo } = request;
  const operation = { operation: "getRepo", resource: "repository", identifier: repoId(repo) };
  return gw.withAuth(operation, auth, async (octokit) => {
    const response = await octokit.rest.repos.get(target(repo));
    return toRepo(response.data as ApiRepo);
  });
}

type ContentFile = {
  type?: string;
  path: string;
  sha: string;
  encoding?: string;
  content?: string;
};

/** Fichier texte UTF-8 de moins de 1 Mo (H4) ; dossier ou contenu non inclus : introuvable. */
export function readFile(gw: Gateway, request: Request<"readFile">): Promise<FileContent> {
  const { auth, repo, ref, path } = request;
  const operation = {
    operation: "readFile",
    resource: "file",
    identifier: `${repoId(repo)}:${path}@${ref}`,
  };
  return gw.withAuth(operation, auth, async (octokit) => {
    const response = await octokit.request("GET /repos/{owner}/{repo}/contents/{+path}", {
      ...target(repo),
      path,
      ref,
    });
    const file = response.data as ContentFile | ContentFile[];
    if (Array.isArray(file) || file.type !== "file") {
      throw new GitNotFoundError({ ...operation, operation: "readFile" });
    }
    if (file.encoding !== "base64" || file.content === undefined) {
      throw new GitProviderError("readFile", "Fichier trop volumineux pour l'API de contenu.");
    }
    return {
      path: file.path,
      ref: await resolveCommitSha(octokit, repo, ref),
      content: Buffer.from(file.content, "base64").toString("utf8"),
      sha: file.sha,
    };
  });
}

type ApiTree = {
  readonly truncated?: boolean;
  readonly tree: ReadonlyArray<{
    readonly path: string;
    readonly type: string;
    readonly sha: string;
  }>;
};

/**
 * Fichiers d'un ref : résolution du commit, puis UN arbre récursif. Un arbre tronqué par GitHub
 * est une erreur (jamais une liste partielle) ; les dossiers et sous-modules sont ignorés.
 */
export function listFiles(gw: Gateway, request: Request<"listFiles">): Promise<FileListing> {
  const { auth, repo, ref } = request;
  const operation = {
    operation: "listFiles",
    resource: "ref",
    identifier: `${repoId(repo)}@${ref}`,
  };
  return gw.withAuth(operation, auth, async (octokit) => {
    const commitSha = await resolveCommitSha(octokit, repo, ref);
    const commit = await octokit.rest.git.getCommit({ ...target(repo), commit_sha: commitSha });
    const response = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
      ...target(repo),
      tree_sha: commit.data.tree.sha,
      recursive: "1",
    });
    const tree = response.data as ApiTree;
    if (tree.truncated === true) {
      throw new GitProviderError("listFiles", "Arbre trop volumineux : liste tronquée par GitHub.");
    }
    const files = tree.tree
      .filter((entry) => entry.type === "blob")
      .map(({ path, sha }) => ({ path, sha }))
      .sort(byPath);
    return { ref: commitSha, files };
  });
}

/** Une seule requête bornée (jamais de page suivante) : du plus récent au plus ancien. */
export function listCommits(
  gw: Gateway,
  request: Request<"listCommits">,
): Promise<readonly Commit[]> {
  const { auth, repo, ref } = request;
  const limit = commitLimit(request.limit);
  const operation = {
    operation: "listCommits",
    resource: "ref",
    identifier: `${repoId(repo)}@${ref}`,
  };
  return gw.withAuth(operation, auth, async (octokit) => {
    const response = await octokit.request("GET /repos/{owner}/{repo}/commits", {
      ...target(repo),
      sha: ref,
      per_page: limit,
    });
    return (response.data as ApiListedCommit[]).map(toListedCommit);
  });
}
