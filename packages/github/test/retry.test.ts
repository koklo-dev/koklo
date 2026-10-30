import { GitProviderUnavailableError } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import {
  caught,
  createMockGitHub,
  installationAuth,
  providerOn,
  prRef,
  repoRef,
} from "./support/mock-github.ts";

const READ = "GET /repos/acme/demo/contents/README.md";
const file = { type: "file", path: "README.md", sha: "f1", encoding: "base64", content: "aGk=" };
const attempt = (counter: { n: number }, ok: object) => () => {
  counter.n += 1;
  return counter.n === 1 ? { status: 502, body: { message: "bad gateway" } } : { body: ok };
};

describe("retry : lectures idempotentes seulement", () => {
  it("un GET en 502 est rejoué puis réussit", async () => {
    const counter = { n: 0 };
    const mock = createMockGitHub({
      [READ]: attempt(counter, file),
      "GET /repos/acme/demo/commits/main": { body: { sha: "c1" } },
      "GET /repos/acme/demo/git/ref/heads/main": { body: { object: { sha: "c1" } } },
    });
    const provider = providerOn(mock, { retries: 2, retryBaseDelayMs: 1 });
    const result = await provider.readFile({
      auth: installationAuth(),
      repo: repoRef,
      ref: "main",
      path: "README.md",
    });
    expect(result.content).toBe("hi");
    expect(mock.count(READ)).toBe(2);
  });

  it("un GET en 502 sans retry (retries: 0) : une seule requête, GitProviderUnavailableError", async () => {
    const mock = createMockGitHub({ [READ]: { status: 502, body: {} } });
    const error = await caught(
      providerOn(mock).readFile({
        auth: installationAuth(),
        repo: repoRef,
        ref: "main",
        path: "README.md",
      }),
    );
    expect(error).toBeInstanceOf(GitProviderUnavailableError);
    expect(mock.count(READ)).toBe(1);
  });
});

describe("aucun retry automatique des écritures non idempotentes", () => {
  const options = { retries: 3, retryBaseDelayMs: 1 } as const;
  const auth = installationAuth();
  const failing = (key: string, extra: Record<string, never> = {}) =>
    createMockGitHub({
      [key]: { status: 502, body: {} },
      "GET /repos/acme/demo/pulls/7": {
        body: {
          number: 7,
          state: "open",
          merged: false,
          head: { sha: "s", ref: "f" },
          base: { ref: "main" },
        },
      },
      ...extra,
    });

  it("createPullRequest", async () => {
    const mock = failing("POST /repos/acme/demo/pulls");
    await caught(
      providerOn(mock, options).createPullRequest({
        auth,
        repo: repoRef,
        base: "main",
        head: "f",
        title: "t",
        body: "b",
      }),
    );
    expect(mock.count("POST /repos/acme/demo/pulls")).toBe(1);
  });

  it("commentPullRequest", async () => {
    const mock = failing("POST /repos/acme/demo/issues/7/comments");
    await caught(
      providerOn(mock, options).commentPullRequest({ auth, pullRequest: prRef, body: "x" }),
    );
    expect(mock.count("POST /repos/acme/demo/issues/7/comments")).toBe(1);
  });

  it("publishCheck", async () => {
    const mock = failing("POST /repos/acme/demo/check-runs");
    await caught(
      providerOn(mock, options).publishCheck({
        auth,
        repo: repoRef,
        sha: "s",
        check: { name: "koklo/policy", status: "completed", conclusion: "success" },
      }),
    );
    expect(mock.count("POST /repos/acme/demo/check-runs")).toBe(1);
  });

  it("une erreur réseau sur une écriture n'est pas rejouée", async () => {
    const mock = createMockGitHub({
      "POST /repos/acme/demo/check-runs": new TypeError("fetch failed"),
    });
    const error = await caught(
      providerOn(mock, options).publishCheck({
        auth,
        repo: repoRef,
        sha: "s",
        check: { name: "koklo/policy", status: "queued" },
      }),
    );
    expect(error).toBeInstanceOf(GitProviderUnavailableError);
    expect(mock.count("POST /repos/acme/demo/check-runs")).toBe(1);
  });
});
