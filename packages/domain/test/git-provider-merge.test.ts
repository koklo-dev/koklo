import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { GitAuth, GitProvider, PullRequestRef, Sha } from "../src/index.ts";
import { GitConflictError, GitProviderError } from "../src/index.ts";
import { FAKE_EXPIRES_AT, FAKE_HEAD_SHA, FakeGitProvider } from "./git-provider.fake.ts";

const SECRET = "ghs_SUPER-SECRET-TOKEN-0123456789";
const auth: GitAuth = { kind: "installation", token: SECRET, expiresAt: FAKE_EXPIRES_AT };
const pullRequest: PullRequestRef = {
  repo: { owner: { kind: "organization", login: "acme" }, name: "spec" },
  number: 7,
};

type MergeRequest = Parameters<GitProvider["mergePullRequest"]>[0];

const attemptMerge = (provider: GitProvider, expectedHeadSha: Sha) =>
  provider.mergePullRequest({
    auth,
    pullRequest,
    method: "squash",
    expectedHeadSha,
  } as MergeRequest);

describe("mergePullRequest exige la tête validée (vision §10.5)", () => {
  it("expectedHeadSha est obligatoire et de type Sha", () => {
    expectTypeOf<MergeRequest["expectedHeadSha"]>().toEqualTypeOf<Sha>();
    expectTypeOf<MergeRequest>().toHaveProperty("expectedHeadSha");
    // @ts-expect-error expectedHeadSha ne peut pas être omis
    const missing: MergeRequest = { auth, pullRequest, method: "merge" };
    expect(missing).toBeDefined();
  });

  it("la requête déclarée dans le port porte expectedHeadSha: Sha (garde d'exécution)", () => {
    const source = readFileSync(new URL("../src/git-provider.ts", import.meta.url), "utf8");
    const block = source.slice(source.indexOf("mergePullRequest(request"));
    expect(block.slice(0, block.indexOf("}):")).replace(/\s+/g, " ")).toContain(
      "expectedHeadSha: Sha",
    );
  });

  it("stale-sha fait partie des raisons typées de GitConflictError", () => {
    expectTypeOf<"stale-sha">().toExtend<GitConflictError["reason"]>();
    expectTypeOf<"not-mergeable">().toExtend<GitConflictError["reason"]>();
    expectTypeOf<GitConflictError["reason"]>().not.toEqualTypeOf<string>();
  });

  it("fusionne quand expectedHeadSha correspond à la tête courante", async () => {
    const result = await attemptMerge(new FakeGitProvider(), FAKE_HEAD_SHA);
    expect(result.sha).toBeTruthy();
  });

  it("refuse par GitConflictError stale-sha quand un push est arrivé", async () => {
    const attempt = attemptMerge(new FakeGitProvider(), "sha-older-than-head");
    await expect(attempt).rejects.toBeInstanceOf(GitConflictError);
    await expect(attempt).rejects.toMatchObject({
      operation: "mergePullRequest",
      reason: "stale-sha",
    });
  });

  it("refuse un sha périmé même si la PR n'est plus fusionnable : stale-sha prime", async () => {
    const attempt = attemptMerge(new FakeGitProvider({ mergeable: false }), "sha-older-than-head");
    await expect(attempt).rejects.toMatchObject({ reason: "stale-sha" });
  });

  it("not-mergeable reste distinct de stale-sha", async () => {
    const attempt = attemptMerge(new FakeGitProvider({ mergeable: false }), FAKE_HEAD_SHA);
    await expect(attempt).rejects.toBeInstanceOf(GitConflictError);
    await expect(attempt).rejects.toMatchObject({ reason: "not-mergeable" });
  });
});

describe("non-fuite du jeton dans les erreurs typées", () => {
  const collect = async (run: () => Promise<unknown>): Promise<unknown> => {
    try {
      await run();
    } catch (error) {
      return error;
    }
    return undefined;
  };

  it("aucune erreur ne contient le jeton fourni dans auth (JSON et message)", async () => {
    const provider = new FakeGitProvider({ mergeable: false });
    const errors = [
      await collect(() => attemptMerge(provider, "sha-older-than-head")),
      await collect(() => attemptMerge(provider, FAKE_HEAD_SHA)),
      await collect(() =>
        provider.createRepo({
          auth,
          owner: { kind: "user", login: "ada" },
          name: "spec",
          visibility: "private",
        }),
      ),
    ];
    for (const error of errors) {
      expect(error).toBeInstanceOf(GitProviderError);
      const typed = error as GitProviderError;
      expect(typed.message).not.toContain(SECRET);
      expect(JSON.stringify(typed)).not.toContain(SECRET);
      expect(String(typed.stack)).not.toContain(SECRET);
    }
  });
});
