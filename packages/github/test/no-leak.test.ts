import { inspect } from "node:util";
import type { GitAuth, GitProvider } from "@koklo/domain";
import { GitProviderError } from "@koklo/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  caught,
  createMockGitHub,
  ORG,
  providerOn,
  prRef,
  repoRef,
  SENTINEL,
} from "./support/mock-github.ts";

const auth: GitAuth = {
  kind: "user",
  token: `${SENTINEL}-token`,
  expiresAt: "2026-10-30T20:00:00.000Z",
  refreshToken: `${SENTINEL}-refresh`,
};
const author = { name: "Koklo", email: "bot@koklo.test" };

type Call = readonly [name: string, run: (p: GitProvider) => Promise<unknown>];
const calls: readonly Call[] = [
  ["createRepo", (p) => p.createRepo({ auth, owner: ORG, name: "demo", visibility: "private" })],
  ["readFile", (p) => p.readFile({ auth, repo: repoRef, ref: "main", path: "a.txt" })],
  [
    "writeCommit",
    (p) =>
      p.writeCommit({
        auth,
        repo: repoRef,
        branch: "main",
        files: [{ path: "a", content: "a" }],
        author,
        message: "m",
      }),
  ],
  ["createBranch", (p) => p.createBranch({ auth, repo: repoRef, base: "main", name: "feat" })],
  [
    "createPullRequest",
    (p) =>
      p.createPullRequest({
        auth,
        repo: repoRef,
        base: "main",
        head: "feat",
        title: "t",
        body: "b",
      }),
  ],
  ["getPullRequestState", (p) => p.getPullRequestState({ auth, pullRequest: prRef })],
  [
    "mergePullRequest",
    (p) => p.mergePullRequest({ auth, pullRequest: prRef, method: "merge", expectedHeadSha: "s" }),
  ],
  ["createTag", (p) => p.createTag({ auth, repo: repoRef, ref: "main", name: "v1" })],
  ["listDeployments", (p) => p.listDeployments({ auth, repo: repoRef, ref: "main" })],
  [
    "publishCheck",
    (p) =>
      p.publishCheck({ auth, repo: repoRef, sha: "s", check: { name: "c", status: "queued" } }),
  ],
  ["commentPullRequest", (p) => p.commentPullRequest({ auth, pullRequest: prRef, body: "x" })],
];

/** Toute réponse, quel que soit le chemin, échoue avec un corps qui répète le secret. */
const failEverywhere = (status: number) => {
  const reply = {
    status,
    headers: { authorization: `token ${SENTINEL}-token`, "x-echo": SENTINEL },
    body: {
      message: `Bad request for ${SENTINEL}-token`,
      documentation_url: `https://x.test/${SENTINEL}`,
    },
  };
  const mock = createMockGitHub();
  mock.fetch = (async () =>
    new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json", ...reply.headers },
    })) as typeof fetch;
  return mock;
};

const surfaces = (error: Error): string[] => [
  error.message,
  error.stack ?? "",
  JSON.stringify(error),
  inspect(error, { depth: 10, showHidden: true }),
  String(error),
  String(error.cause ?? ""),
];

afterEach(() => vi.restoreAllMocks());

describe("CA9 aucune fuite de secret dans les erreurs ni les journaux", () => {
  describe.each([404, 403, 422, 500])("réponse %i dont le corps répète le secret", (status) => {
    it.each(calls)("%s", async (_name, run) => {
      const logged: unknown[] = [];
      const consoles = (["log", "warn", "error", "info", "debug"] as const).map((m) =>
        vi.spyOn(console, m).mockImplementation(() => undefined),
      );
      const provider = providerOn(failEverywhere(status), {
        clientSecret: `${SENTINEL}-client`,
        logger: (entry) => logged.push(entry),
      });
      const error = await caught(run(provider));
      expect(error).toBeInstanceOf(GitProviderError);
      for (const surface of surfaces(error)) expect(surface).not.toContain(SENTINEL);
      expect(error.cause).toBeUndefined();
      expect(JSON.stringify(logged)).not.toContain(SENTINEL);
      for (const spy of consoles) expect(JSON.stringify(spy.mock.calls)).not.toContain(SENTINEL);
    });
  });

  it.each(calls)("%s : erreur réseau dont le message contient le secret", async (_name, run) => {
    const mock = createMockGitHub();
    mock.fetch = (async () => {
      throw new TypeError(`fetch failed for https://x.test/?access_token=${SENTINEL}-token`);
    }) as typeof fetch;
    const error = await caught(run(providerOn(mock)));
    expect(error).toBeInstanceOf(GitProviderError);
    for (const surface of surfaces(error)) expect(surface).not.toContain(SENTINEL);
    expect(error.cause).toBeUndefined();
  });

  it("le logger injecté ne reçoit que opération, statut et durée", async () => {
    const logged: Array<Record<string, unknown>> = [];
    const provider = providerOn(failEverywhere(404), {
      logger: (entry) => logged.push({ ...entry }),
    });
    await caught(provider.readFile({ auth, repo: repoRef, ref: "main", path: "a.txt" }));
    expect(logged.length).toBeGreaterThan(0);
    for (const entry of logged) {
      expect(
        Object.keys(entry).every((k) => ["operation", "status", "durationMs"].includes(k)),
      ).toBe(true);
    }
  });
});
