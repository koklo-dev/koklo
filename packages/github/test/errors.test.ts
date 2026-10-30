import {
  GitAuthExpiredError,
  GitConflictError,
  GitNotFoundError,
  GitProviderError,
  GitProviderUnavailableError,
  GitRateLimitedError,
  RepoCreationForbiddenError,
} from "@koklo/domain";
import { RequestError } from "@octokit/request-error";
import { describe, expect, it } from "vitest";
import {
  caught,
  createMockGitHub,
  installationAuth,
  ORG,
  PERSON,
  providerOn,
  prRef,
  repoRef,
  userAuth,
} from "./support/mock-github.ts";

const read = (provider: ReturnType<typeof providerOn>, auth = installationAuth()) =>
  provider.readFile({ auth, repo: repoRef, ref: "main", path: "README.md" });
const READ = "GET /repos/acme/demo/contents/README.md";

describe("CA5 mapping des erreurs GitHub vers les erreurs du port", () => {
  it("401 avec jeton d'installation : GitAuthExpiredError non rafraîchissable", async () => {
    const mock = createMockGitHub({
      [READ]: { status: 401, body: { message: "Bad credentials" } },
    });
    const error = await caught(read(providerOn(mock)));
    expect(error).toBeInstanceOf(GitAuthExpiredError);
    expect(error).toMatchObject({
      kind: "installation",
      refreshable: false,
      operation: "readFile",
    });
  });

  it("401 avec jeton utilisateur et refreshToken : rafraîchissable", async () => {
    const mock = createMockGitHub({
      [READ]: { status: 401, body: { message: "Bad credentials" } },
    });
    const error = await caught(read(providerOn(mock), userAuth("uat-fake", "ref-fake")));
    expect(error).toMatchObject({ kind: "user", refreshable: true });
  });

  it("401 avec jeton utilisateur sans refreshToken : non rafraîchissable", async () => {
    const mock = createMockGitHub({
      [READ]: { status: 401, body: { message: "Bad credentials" } },
    });
    const error = await caught(read(providerOn(mock), userAuth()));
    expect(error).toMatchObject({ kind: "user", refreshable: false });
  });

  it("403 « Resource not accessible by integration » à la création : RepoCreationForbiddenError", async () => {
    const mock = createMockGitHub({
      "POST /orgs/acme/repos": {
        status: 403,
        body: { message: "Resource not accessible by integration" },
      },
    });
    const error = await caught(
      providerOn(mock).createRepo({
        auth: installationAuth(),
        owner: ORG,
        name: "demo",
        visibility: "private",
      }),
    );
    expect(error).toBeInstanceOf(RepoCreationForbiddenError);
    expect(error).toMatchObject({ reason: "resource-not-accessible", owner: ORG });
  });

  it("403 de permission hors création : GitProviderError de base (ni sous-classe, ni quota)", async () => {
    const mock = createMockGitHub({ [READ]: { status: 403, body: { message: "Forbidden" } } });
    const error = await caught(read(providerOn(mock)));
    expect(error).toBeInstanceOf(GitProviderError);
    expect(error.constructor).toBe(GitProviderError);
    expect(error).toMatchObject({ operation: "readFile" });
  });

  it("404 : GitNotFoundError (dépôt privé inaccessible inclus)", async () => {
    const mock = createMockGitHub({ [READ]: { status: 404, body: { message: "Not Found" } } });
    const error = await caught(read(providerOn(mock)));
    expect(error).toBeInstanceOf(GitNotFoundError);
    expect(error).toMatchObject({ operation: "readFile" });
  });

  it("429 avec retry-after : GitRateLimitedError avec retryAfterMs en millisecondes", async () => {
    const mock = createMockGitHub({
      [READ]: { status: 429, headers: { "retry-after": "30" }, body: { message: "rate limited" } },
    });
    const error = await caught(read(providerOn(mock)));
    expect(error).toBeInstanceOf(GitRateLimitedError);
    expect((error as GitRateLimitedError).retryAfterMs).toBe(30_000);
    expect(mock.count(READ)).toBe(1);
  });

  it("403 avec x-ratelimit-remaining 0 et x-ratelimit-reset : délai calculé sur l'horloge injectée", async () => {
    const reset = Math.floor(Date.parse("2026-10-30T12:00:45.000Z") / 1000);
    const mock = createMockGitHub({
      [READ]: {
        status: 403,
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) },
        body: { message: "API rate limit exceeded" },
      },
    });
    const error = await caught(read(providerOn(mock)));
    expect(error).toBeInstanceOf(GitRateLimitedError);
    expect((error as GitRateLimitedError).retryAfterMs).toBe(45_000);
  });

  it("403 « secondary rate limit » sans en-tête : GitRateLimitedError sans délai", async () => {
    const mock = createMockGitHub({
      [READ]: { status: 403, body: { message: "You have exceeded a secondary rate limit." } },
    });
    const error = await caught(read(providerOn(mock)));
    expect(error).toBeInstanceOf(GitRateLimitedError);
    expect((error as GitRateLimitedError).retryAfterMs).toBeUndefined();
  });

  it("409 sur un commit : GitConflictError", async () => {
    const mock = createMockGitHub({
      "GET /repos/acme/demo/git/ref/heads/main": { body: { object: { sha: "h1" } } },
      "GET /repos/acme/demo/git/commits/h1": { body: { sha: "h1", tree: { sha: "t0" } } },
      "POST /repos/acme/demo/git/trees": {
        status: 409,
        body: { message: "Git Repository is empty." },
      },
    });
    const error = await caught(
      providerOn(mock).writeCommit({
        auth: installationAuth(),
        repo: repoRef,
        branch: "main",
        files: [{ path: "a.txt", content: "a" }],
        author: { name: "Koklo", email: "bot@koklo.test" },
        message: "feat: a",
      }),
    );
    expect(error).toBeInstanceOf(GitConflictError);
  });

  it("422 « already exists » à la création du dépôt : GitConflictError exists", async () => {
    const mock = createMockGitHub({
      "POST /orgs/acme/repos": {
        status: 422,
        body: {
          message: "Repository creation failed.",
          errors: [{ message: "name already exists on this account" }],
        },
      },
    });
    const error = await caught(
      providerOn(mock).createRepo({
        auth: installationAuth(),
        owner: ORG,
        name: "demo",
        visibility: "private",
      }),
    );
    expect(error).toBeInstanceOf(GitConflictError);
    expect((error as GitConflictError).reason).toBe("exists");
  });

  it("422 « Reference already exists » à la création de branche : exists", async () => {
    const mock = createMockGitHub({
      "GET /repos/acme/demo/git/ref/heads/main": { body: { object: { sha: "h1" } } },
      "GET /repos/acme/demo/commits/main": { body: { sha: "h1" } },
      "POST /repos/acme/demo/git/refs": {
        status: 422,
        body: { message: "Reference already exists" },
      },
    });
    const error = await caught(
      providerOn(mock).createBranch({
        auth: installationAuth(),
        repo: repoRef,
        base: "main",
        name: "feat",
      }),
    );
    expect(error).toBeInstanceOf(GitConflictError);
    expect((error as GitConflictError).reason).toBe("exists");
  });

  it("422 « Reference already exists » à la pose d'un tag : exists", async () => {
    const mock = createMockGitHub({
      "GET /repos/acme/demo/git/ref/heads/main": { body: { object: { sha: "h1" } } },
      "GET /repos/acme/demo/commits/main": { body: { sha: "h1" } },
      "POST /repos/acme/demo/git/refs": {
        status: 422,
        body: { message: "Reference already exists" },
      },
    });
    const error = await caught(
      providerOn(mock).createTag({
        auth: installationAuth(),
        repo: repoRef,
        ref: "main",
        name: "v1.0.0",
      }),
    );
    expect(error).toBeInstanceOf(GitConflictError);
    expect((error as GitConflictError).reason).toBe("exists");
  });

  it("422 « A pull request already exists » : exists", async () => {
    const mock = createMockGitHub({
      "POST /repos/acme/demo/pulls": {
        status: 422,
        body: {
          message: "Validation Failed",
          errors: [{ message: "A pull request already exists for acme:feat." }],
        },
      },
    });
    const error = await caught(
      providerOn(mock).createPullRequest({
        auth: installationAuth(),
        repo: repoRef,
        base: "main",
        head: "feat",
        title: "t",
        body: "b",
      }),
    );
    expect(error).toBeInstanceOf(GitConflictError);
    expect((error as GitConflictError).reason).toBe("exists");
  });

  it("422 de validation autre : GitProviderError de base", async () => {
    const mock = createMockGitHub({
      "POST /repos/acme/demo/pulls": {
        status: 422,
        body: { message: "Validation Failed", errors: [{ message: "head is invalid" }] },
      },
    });
    const error = await caught(
      providerOn(mock).createPullRequest({
        auth: installationAuth(),
        repo: repoRef,
        base: "main",
        head: "feat",
        title: "t",
        body: "b",
      }),
    );
    expect(error.constructor).toBe(GitProviderError);
  });

  it.each([500, 502, 503])("%i : GitProviderUnavailableError", async (status) => {
    const mock = createMockGitHub({ [READ]: { status, body: { message: "boom" } } });
    const error = await caught(read(providerOn(mock)));
    expect(error).toBeInstanceOf(GitProviderUnavailableError);
  });

  it("erreur réseau (fetch failed) : GitProviderUnavailableError", async () => {
    const mock = createMockGitHub({ [READ]: new TypeError("fetch failed") });
    const error = await caught(read(providerOn(mock)));
    expect(error).toBeInstanceOf(GitProviderUnavailableError);
  });

  it("jamais de RequestError en cause, quel que soit le statut", async () => {
    for (const status of [401, 403, 404, 409, 422, 429, 500]) {
      const mock = createMockGitHub({ [READ]: { status, body: { message: "x" } } });
      const error = await caught(read(providerOn(mock)));
      expect(error, String(status)).toBeInstanceOf(GitProviderError);
      expect(error.cause, String(status)).toBeUndefined();
      expect(error).not.toBeInstanceOf(RequestError);
    }
  });

  it("une erreur typée du port n'expose que des champs fonctionnels", async () => {
    const mock = createMockGitHub({
      "GET /repos/acme/demo/pulls/7": { status: 404, body: { message: "Not Found" } },
    });
    const error = await caught(
      providerOn(mock).getPullRequestState({ auth: installationAuth(), pullRequest: prRef }),
    );
    expect(error).toBeInstanceOf(GitNotFoundError);
    expect(Object.keys(error).sort()).toEqual(["identifier", "operation", "resource"]);
  });

  it("429 avec retry-after court et maxAutoRetryMs à 0 : aucune nouvelle tentative d'une écriture", async () => {
    const mock = createMockGitHub({
      "POST /user/repos": {
        status: 429,
        headers: { "retry-after": "1" },
        body: { message: "slow" },
      },
    });
    const error = await caught(
      providerOn(mock, { maxAutoRetryMs: 0 }).createRepo({
        auth: userAuth(),
        owner: PERSON,
        name: "demo",
        visibility: "private",
      }),
    );
    expect(error).toBeInstanceOf(GitRateLimitedError);
    expect(mock.count("POST /user/repos")).toBe(1);
  });
});
