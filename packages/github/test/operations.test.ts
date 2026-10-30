import { GitNotFoundError, GitProviderError, WEBHOOK_EVENTS } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import {
  caught,
  createMockGitHub,
  installationAuth,
  providerOn,
  prRef,
  repoRef,
} from "./support/mock-github.ts";

const auth = installationAuth();
const REPO = "/repos/acme/demo";
const SHA = "0123456789abcdef0123456789abcdef01234567";
const pull = (overrides: Record<string, unknown> = {}) => ({
  number: 7,
  state: "open",
  merged: false,
  mergeable: null,
  title: "Titre",
  body: null,
  html_url: "https://github.com/acme/demo/pull/7",
  head: { sha: "h1", ref: "feat" },
  base: { ref: "main" },
  ...overrides,
});
const checkRun = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  head_sha: "h1",
  status: "completed",
  conclusion: "success",
  ...extra,
});

describe("readFile", () => {
  const file = (content: string, extra: Record<string, unknown> = {}) => ({
    body: { type: "file", path: "docs/a é.md", sha: "b1", encoding: "base64", content, ...extra },
  });

  it("décode l'UTF-8 et résout la branche en SHA de commit", async () => {
    const mock = createMockGitHub({
      [`GET ${REPO}/contents/docs/a%20%C3%A9.md`]: file(
        Buffer.from("bonjour é").toString("base64"),
      ),
      [`GET ${REPO}/commits/feat/x`]: { body: { sha: "c9" } },
    });
    const result = await providerOn(mock).readFile({
      auth,
      repo: repoRef,
      ref: "feat/x",
      path: "docs/a é.md",
    });
    expect(result).toEqual({ path: "docs/a é.md", ref: "c9", content: "bonjour é", sha: "b1" });
    expect(mock.requests[0]?.query.get("ref")).toBe("feat/x");
  });

  it("un SHA complet n'est pas résolu une seconde fois", async () => {
    const mock = createMockGitHub({
      [`GET ${REPO}/contents/a.txt`]: file("YQ==", { path: "a.txt" }),
    });
    const result = await providerOn(mock).readFile({
      auth,
      repo: repoRef,
      ref: SHA,
      path: "a.txt",
    });
    expect(result.ref).toBe(SHA);
    expect(mock.requests).toHaveLength(1);
  });

  it("un dossier est introuvable", async () => {
    const mock = createMockGitHub({ [`GET ${REPO}/contents/docs`]: { body: [{ type: "file" }] } });
    const error = await caught(
      providerOn(mock).readFile({ auth, repo: repoRef, ref: "main", path: "docs" }),
    );
    expect(error).toBeInstanceOf(GitNotFoundError);
  });

  it("un fichier sans contenu inclus (trop gros) : erreur explicite du port", async () => {
    const mock = createMockGitHub({
      [`GET ${REPO}/contents/big.bin`]: file("", { encoding: "none", content: undefined }),
    });
    const error = await caught(
      providerOn(mock).readFile({ auth, repo: repoRef, ref: "main", path: "big.bin" }),
    );
    expect(error.constructor).toBe(GitProviderError);
  });
});

describe("branches et tags", () => {
  const routes = {
    [`GET ${REPO}/commits/main`]: { body: { sha: "c1" } },
    [`POST ${REPO}/git/refs`]: { status: 201, body: {} },
  };

  it("createBranch : refs/heads/{nom} sur le SHA de la base", async () => {
    const mock = createMockGitHub(routes);
    const branch = await providerOn(mock).createBranch({
      auth,
      repo: repoRef,
      base: "main",
      name: "feat",
    });
    expect(branch).toEqual({ name: "feat", sha: "c1" });
    expect(mock.writes()[0]?.body).toMatchObject({ ref: "refs/heads/feat", sha: "c1" });
  });

  it("createTag : tag léger refs/tags/{nom}", async () => {
    const mock = createMockGitHub(routes);
    const tag = await providerOn(mock).createTag({ auth, repo: repoRef, ref: "main", name: "v1" });
    expect(tag).toEqual({ name: "v1", sha: "c1" });
    expect(mock.writes()[0]?.body).toMatchObject({ ref: "refs/tags/v1", sha: "c1" });
  });
});

describe("pull requests", () => {
  it("createPullRequest : non brouillon, état et checks de la tête", async () => {
    const mock = createMockGitHub({
      [`POST ${REPO}/pulls`]: { status: 201, body: pull() },
      [`GET ${REPO}/commits/h1/check-runs`]: {
        body: {
          total_count: 4,
          check_runs: [
            checkRun("ci", { details_url: "https://ci.test/1", output: { summary: "ok" } }),
            checkRun("lint", { status: "weird", conclusion: "skipped" }),
            checkRun("deploy", { status: "in_progress", conclusion: null }),
            checkRun("old", { conclusion: "stale" }),
          ],
        },
      },
    });
    const result = await providerOn(mock).createPullRequest({
      auth,
      repo: repoRef,
      base: "main",
      head: "feat",
      title: "Titre",
      body: "Corps",
    });
    expect(mock.writes()[0]?.body).toMatchObject({ base: "main", head: "feat", draft: false });
    expect(result).toMatchObject({
      ref: prRef,
      status: "open",
      headSha: "h1",
      baseBranch: "main",
      headBranch: "feat",
      mergeable: null,
      title: "Titre",
      body: "",
      htmlUrl: "https://github.com/acme/demo/pull/7",
    });
    expect(result.checks).toEqual([
      {
        name: "ci",
        sha: "h1",
        status: "completed",
        conclusion: "success",
        detailsUrl: "https://ci.test/1",
        summary: "ok",
      },
      { name: "lint", sha: "h1", status: "queued", conclusion: "neutral" },
      { name: "deploy", sha: "h1", status: "in_progress" },
      { name: "old", sha: "h1", status: "completed", conclusion: "neutral" },
    ]);
  });

  it.each([
    ["fusionnée", pull({ merged: true, state: "closed", merge_commit_sha: "m1" }), "merged", "m1"],
    ["fermée", pull({ state: "closed" }), "closed", undefined],
  ] as const)("getPullRequestState : PR %s", async (_label, body, status, mergedSha) => {
    const mock = createMockGitHub({
      [`GET ${REPO}/pulls/7`]: { body },
      [`GET ${REPO}/commits/h1/check-runs`]: { body: { total_count: 0, check_runs: [] } },
    });
    const state = await providerOn(mock).getPullRequestState({ auth, pullRequest: prRef });
    expect(state.status).toBe(status);
    expect(state.mergedSha).toBe(mergedSha);
    expect(state.checks).toEqual([]);
  });

  it("mergePullRequest : GitHub répond merged=false : not-mergeable", async () => {
    const mock = createMockGitHub({
      [`GET ${REPO}/pulls/7`]: { body: pull() },
      [`PUT ${REPO}/pulls/7/merge`]: { body: { merged: false, sha: "" } },
    });
    const error = await caught(
      providerOn(mock).mergePullRequest({
        auth,
        pullRequest: prRef,
        method: "rebase",
        expectedHeadSha: "h1",
      }),
    );
    expect(error).toMatchObject({ reason: "not-mergeable" });
  });

  it("commentPullRequest : identifiant en chaîne et URL", async () => {
    const mock = createMockGitHub({
      [`POST ${REPO}/issues/7/comments`]: {
        status: 201,
        body: { id: 99, html_url: "https://github.com/acme/demo/pull/7#issuecomment-99" },
      },
    });
    const comment = await providerOn(mock).commentPullRequest({
      auth,
      pullRequest: prRef,
      body: "bonjour",
    });
    expect(comment).toEqual({
      id: "99",
      htmlUrl: "https://github.com/acme/demo/pull/7#issuecomment-99",
    });
    expect(mock.writes()[0]?.body).toEqual({ body: "bonjour" });
  });
});

describe("publishCheck", () => {
  const created = { status: 201, body: checkRun("koklo/policy") };

  it("envoie nom, SHA, statut, conclusion, lien et sortie", async () => {
    const mock = createMockGitHub({ [`POST ${REPO}/check-runs`]: created });
    const run = await providerOn(mock).publishCheck({
      auth,
      repo: repoRef,
      sha: "h1",
      check: {
        name: "koklo/policy",
        status: "completed",
        conclusion: "success",
        title: "Politique",
        summary: "tout est vert",
        detailsUrl: "https://koklo.test/c/1",
      },
    });
    expect(run).toMatchObject({ name: "koklo/policy", sha: "h1", conclusion: "success" });
    expect(mock.writes()[0]?.body).toMatchObject({
      name: "koklo/policy",
      head_sha: "h1",
      status: "completed",
      conclusion: "success",
      details_url: "https://koklo.test/c/1",
      output: { title: "Politique", summary: "tout est vert" },
    });
  });

  it("n'envoie pas de conclusion queued/in_progress ni de sortie vide", async () => {
    const mock = createMockGitHub({ [`POST ${REPO}/check-runs`]: created });
    await providerOn(mock).publishCheck({
      auth,
      repo: repoRef,
      sha: "h1",
      check: { name: "koklo/policy", status: "in_progress", conclusion: "in_progress" },
    });
    const body = mock.writes()[0]?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("conclusion");
    expect(body).not.toHaveProperty("output");
  });
});

describe("subscribeWebhooks", () => {
  const subscription = (events: readonly string[]) =>
    ({ repo: repoRef, events }) as Parameters<
      ReturnType<typeof providerOn>["subscribeWebhooks"]
    >[0]["subscription"];

  it("accepte les événements du port sans aucun appel réseau", async () => {
    const mock = createMockGitHub();
    await providerOn(mock).subscribeWebhooks({
      auth,
      subscription: subscription([...WEBHOOK_EVENTS]),
    });
    expect(mock.requests).toEqual([]);
  });

  it("refuse un événement inconnu", async () => {
    const error = await caught(
      providerOn(createMockGitHub()).subscribeWebhooks({
        auth,
        subscription: subscription(["push", "star"]),
      }),
    );
    expect(error).toBeInstanceOf(GitProviderError);
    expect(error.message).toContain("star");
  });
});

describe("journal", () => {
  it("une opération réussie journalise opération et durée, sans statut", async () => {
    const entries: Array<Record<string, unknown>> = [];
    const mock = createMockGitHub({
      [`GET ${REPO}/commits/main`]: { body: { sha: "c1" } },
      [`POST ${REPO}/git/refs`]: { status: 201, body: {} },
    });
    await providerOn(mock, { logger: (entry) => entries.push({ ...entry }) }).createTag({
      auth,
      repo: repoRef,
      ref: "main",
      name: "v1",
    });
    expect(entries).toHaveLength(1);
    expect(Object.keys(entries[0] ?? {}).sort()).toEqual(["durationMs", "operation"]);
  });
});
