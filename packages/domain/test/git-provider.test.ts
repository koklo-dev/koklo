import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  GitAuth,
  GitInstallation,
  GitOwner,
  GitProvider,
  WebhookEventName,
} from "../src/index.ts";
import { UserTokenRequiredError } from "../src/index.ts";
import { FAKE_EXPIRES_AT, FakeGitProvider } from "./git-provider.fake.ts";

const METHODS = [
  "authenticate",
  "createRepo",
  "getRepo",
  "readFile",
  "writeCommit",
  "listFiles",
  "listCommits",
  "createBranch",
  "createPullRequest",
  "getPullRequestState",
  "mergePullRequest",
  "createTag",
  "listDeployments",
  "publishCheck",
  "commentPullRequest",
  "subscribeWebhooks",
] as const;

const org: GitOwner = { kind: "organization", login: "acme" };
const user: GitOwner = { kind: "user", login: "ada" };
const installationOf = (owner: GitOwner): GitInstallation => ({ id: "42", owner });
const installationAuth: GitAuth = {
  kind: "installation",
  token: "iat",
  expiresAt: FAKE_EXPIRES_AT,
};
const userAuth: GitAuth = { kind: "user", token: "uat", expiresAt: FAKE_EXPIRES_AT };

const provider: GitProvider = new FakeGitProvider();

describe("CA3 forme du port GitProvider", () => {
  it("expose exactement les 16 opérations (TK-44 : listFiles, listCommits)", () => {
    expectTypeOf<keyof GitProvider>().toEqualTypeOf<(typeof METHODS)[number]>();
    for (const method of METHODS) {
      expect(typeof provider[method], method).toBe("function");
    }
  });

  it("toutes les opérations sont asynchrones", async () => {
    const result = provider.subscribeWebhooks({
      auth: installationAuth,
      subscription: { repo: { owner: org, name: "spec" }, events: ["push"] },
    });
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });
});

describe("CA4 propriétaire", () => {
  it("GitOwner.kind vaut exactement organization | user", () => {
    expectTypeOf<GitOwner["kind"]>().toEqualTypeOf<"organization" | "user">();
  });

  it("createRepo sur une organisation avec un jeton d'installation réussit", async () => {
    const repo = await provider.createRepo({
      auth: installationAuth,
      owner: org,
      name: "spec",
      visibility: "private",
    });
    expect(repo.ref).toEqual({ owner: org, name: "spec" });
  });

  it("createRepo sur un compte utilisateur avec un jeton utilisateur réussit", async () => {
    const repo = await provider.createRepo({
      auth: userAuth,
      owner: user,
      name: "spec",
      visibility: "public",
    });
    expect(repo.ref.owner).toEqual(user);
  });

  it("createRepo sur un compte utilisateur avec un jeton d'installation lève UserTokenRequiredError", async () => {
    const attempt = provider.createRepo({
      auth: installationAuth,
      owner: user,
      name: "spec",
      visibility: "private",
    });
    await expect(attempt).rejects.toBeInstanceOf(UserTokenRequiredError);
    await expect(attempt).rejects.toMatchObject({ owner: user });
  });
});

describe("CA5 authenticate et GitAuth", () => {
  it("sans identifiants utilisateur rend un jeton d'installation", async () => {
    const auth = await provider.authenticate({ installation: installationOf(org) });
    expect(auth.kind).toBe("installation");
  });

  it("avec identifiants utilisateur rend un jeton utilisateur", async () => {
    const auth = await provider.authenticate({
      installation: installationOf(user),
      user: { token: "uat", expiresAt: FAKE_EXPIRES_AT },
    });
    expect(auth.kind).toBe("user");
    expect(auth.token).toBe("uat");
  });

  it("GitAuth est une union discriminée exhaustive", () => {
    const describeAuth = (auth: GitAuth): string => {
      switch (auth.kind) {
        case "installation":
          return "installation";
        case "user":
          return auth.refreshToken ?? "user";
        default: {
          const unreachable: never = auth;
          return unreachable;
        }
      }
    };
    expect(describeAuth(installationAuth)).toBe("installation");
    expect(describeAuth({ ...userAuth, refreshToken: "r" })).toBe("r");
    expectTypeOf<GitAuth["kind"]>().toEqualTypeOf<"installation" | "user">();
  });
});

describe("CA7 types d'événements webhook", () => {
  it("WebhookEventName couvre les 8 événements", () => {
    expectTypeOf<WebhookEventName>().toEqualTypeOf<
      | "installation"
      | "push"
      | "pull_request"
      | "pull_request_review"
      | "check_suite"
      | "check_run"
      | "workflow_run"
      | "deployment_status"
    >();
  });
});
