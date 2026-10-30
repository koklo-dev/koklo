import {
  type FileContent,
  GitNotFoundError,
  GitProviderError,
  type Repo,
  UserTokenRequiredError,
} from "@koklo/domain";
import { WRITE } from "../client.ts";
import type { Gateway } from "../gateway.ts";
import { type ApiRepo, toRepo } from "../mappers.ts";
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
