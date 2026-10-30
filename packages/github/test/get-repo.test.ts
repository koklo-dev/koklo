import { GitNotFoundError, GitRateLimitedError } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import {
  caught,
  createMockGitHub,
  installationAuth,
  ORG,
  PERSON,
  providerOn,
  userAuth,
} from "./support/mock-github.ts";

/** TK-43 (QB1) : `Repo.id` (GitHub `id` numérique rendu en chaîne) et `getRepo` de l'adaptateur. */
const apiRepo = (over: Record<string, unknown> = {}) => ({
  id: 1234567890,
  name: "demo",
  private: true,
  default_branch: "main",
  html_url: "https://github.com/acme/demo",
  owner: { login: "acme", type: "Organization" },
  ...over,
});

describe("Repo.id : identifiant GitHub rendu en chaîne", () => {
  it("createRepo (organisation) : id numérique converti en chaîne", async () => {
    const mock = createMockGitHub({ "POST /orgs/acme/repos": { status: 201, body: apiRepo() } });
    const repo = await providerOn(mock).createRepo({
      auth: installationAuth(),
      owner: ORG,
      name: "demo",
      visibility: "private",
    });
    expect(repo.id).toBe("1234567890");
  });

  it("createRepo (compte personnel) et modèle : id lu aussi", async () => {
    const person = apiRepo({ id: 77, owner: { login: "octo", type: "User" } });
    const mock = createMockGitHub({
      "POST /user/repos": { status: 201, body: person },
      "POST /repos/acme/tpl/generate": { status: 201, body: apiRepo({ id: 78 }) },
    });
    const provider = providerOn(mock);
    const personal = await provider.createRepo({
      auth: userAuth(),
      owner: PERSON,
      name: "demo",
      visibility: "private",
    });
    const generated = await provider.createRepo({
      auth: installationAuth(),
      owner: ORG,
      name: "demo",
      visibility: "private",
      template: { owner: ORG, name: "tpl" },
    });
    expect([personal.id, generated.id]).toEqual(["77", "78"]);
  });

  it("l'identifiant ne dépend pas du nom : un renommage ne le change pas", async () => {
    const mock = createMockGitHub({
      "GET /repos/acme/avant": { body: apiRepo({ name: "avant" }) },
      "GET /repos/acme/apres": { body: apiRepo({ name: "apres" }) },
    });
    const provider = providerOn(mock);
    const before = await provider.getRepo({
      auth: installationAuth(),
      repo: { owner: ORG, name: "avant" },
    });
    const after = await provider.getRepo({
      auth: installationAuth(),
      repo: { owner: ORG, name: "apres" },
    });
    expect(before.id).toBe(after.id);
    expect(before.ref.name).not.toBe(after.ref.name);
  });
});

describe("getRepo", () => {
  it("GET /repos/{owner}/{repo} avec le jeton fourni, aucune écriture", async () => {
    const mock = createMockGitHub({ "GET /repos/acme/demo": { body: apiRepo() } });
    const repo = await providerOn(mock).getRepo({
      auth: installationAuth("iat-lecture"),
      repo: { owner: ORG, name: "demo" },
    });
    expect(repo).toEqual({
      id: "1234567890",
      ref: { owner: ORG, name: "demo" },
      visibility: "private",
      defaultBranch: "main",
      htmlUrl: "https://github.com/acme/demo",
    });
    expect(mock.requests).toHaveLength(1);
    expect(mock.requests[0]?.headers.authorization).toContain("iat-lecture");
    expect(mock.writes()).toEqual([]);
  });

  it("le type du propriétaire est lu chez GitHub (compte personnel) et la visibilité publique", async () => {
    const mock = createMockGitHub({
      "GET /repos/octo/demo": {
        body: apiRepo({ private: false, owner: { login: "octo", type: "User" } }),
      },
    });
    const repo = await providerOn(mock).getRepo({
      auth: installationAuth(),
      repo: { owner: PERSON, name: "demo" },
    });
    expect(repo.ref.owner).toEqual(PERSON);
    expect(repo.visibility).toBe("public");
  });

  it("dépôt introuvable ou hors installation (404) : GitNotFoundError, opération getRepo", async () => {
    const mock = createMockGitHub();
    const error = await caught(
      providerOn(mock).getRepo({ auth: installationAuth(), repo: { owner: ORG, name: "absent" } }),
    );
    expect(error).toBeInstanceOf(GitNotFoundError);
    expect(error).toMatchObject({ operation: "getRepo" });
  });

  it("quota atteint (429) : GitRateLimitedError, jeton absent du message", async () => {
    const mock = createMockGitHub({
      "GET /repos/acme/demo": {
        status: 429,
        body: { message: "rate limit" },
        headers: { "retry-after": "30" },
      },
    });
    const error = await caught(
      providerOn(mock).getRepo({
        auth: installationAuth("iat-secret-limite"),
        repo: { owner: ORG, name: "demo" },
      }),
    );
    expect(error).toBeInstanceOf(GitRateLimitedError);
    expect((error as GitRateLimitedError).retryAfterMs).toBe(30_000);
    expect(error.message).not.toContain("iat-secret-limite");
  });
});
