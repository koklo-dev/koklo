import { inspect } from "node:util";
import {
  type GitAuth,
  GitAuthExpiredError,
  GitNotFoundError,
  type GitProvider,
  GitProviderError,
  GitProviderUnavailableError,
  GitRateLimitedError,
} from "@koklo/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  caught,
  createMockGitHub,
  providerOn,
  repoRef,
  SENTINEL,
  userAuth,
} from "./support/mock-github.ts";

/**
 * TK-44a : `listFiles`, `listCommits` et `writeCommit` (avec `expectedHeadSha`) traduisent les
 * erreurs HTTP comme le reste de l'adaptateur et ne laissent fuiter ni jeton ni corps de réponse.
 */
const auth: GitAuth = {
  kind: "installation",
  token: `${SENTINEL}-token`,
  expiresAt: "2026-10-30T13:00:00.000Z",
};
const author = { name: "Koklo", email: "koklo-bot@users.noreply.invalid" };

type Call = readonly [operation: string, run: (p: GitProvider, a?: GitAuth) => Promise<unknown>];
const calls: readonly Call[] = [
  ["listFiles", (p, a = auth) => p.listFiles({ auth: a, repo: repoRef, ref: "cadrage" })],
  ["listCommits", (p, a = auth) => p.listCommits({ auth: a, repo: repoRef, ref: "cadrage" })],
  [
    "writeCommit",
    (p, a = auth) =>
      p.writeCommit({
        auth: a,
        repo: repoRef,
        branch: "cadrage",
        files: [
          { path: "a.md", content: "a" },
          { path: "b.md", delete: true },
        ],
        expectedHeadSha: "abc",
        author,
        message: "spec: lot",
      }),
  ],
];

const failEverywhere = (
  status: number,
  headers: Record<string, string> = {},
  message = "Failure",
) => {
  const mock = createMockGitHub();
  const record = mock.fetch;
  mock.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    await record(input, init); // enregistre la requête dans `mock.requests` (réponse ignorée)
    return new Response(
      JSON.stringify({ message, documentation_url: `https://x.test/${SENTINEL}` }),
      { status, headers: { "content-type": "application/json", ...headers } },
    );
  }) as typeof fetch;
  return mock;
};

const surfaces = (error: Error): string[] => [
  error.message,
  error.stack ?? "",
  JSON.stringify(error),
  inspect(error, { depth: 10, showHidden: true }),
  String(error.cause ?? ""),
];

afterEach(() => vi.restoreAllMocks());

describe.each(calls)("TK-44a mapping des erreurs HTTP : %s", (operation, run) => {
  it("401 : GitAuthExpiredError non rafraîchissable (jeton d'installation)", async () => {
    const error = await caught(run(providerOn(failEverywhere(401))));
    expect(error).toBeInstanceOf(GitAuthExpiredError);
    expect(error).toMatchObject({ operation, kind: "installation", refreshable: false });
  });

  it("401 avec jeton utilisateur et refreshToken : rafraîchissable", async () => {
    const error = await caught(
      run(providerOn(failEverywhere(401)), userAuth("uat-fake", "ref-fake")),
    );
    expect(error).toMatchObject({ kind: "user", refreshable: true });
  });

  it("404 : GitNotFoundError", async () => {
    const error = await caught(run(providerOn(failEverywhere(404))));
    expect(error).toBeInstanceOf(GitNotFoundError);
    expect(error).toMatchObject({ operation });
  });

  it("429 avec retry-after : GitRateLimitedError en millisecondes, sans nouvelle tentative", async () => {
    const mock = failEverywhere(429, { "retry-after": "30" });
    const error = await caught(run(providerOn(mock)));
    expect(error).toBeInstanceOf(GitRateLimitedError);
    expect((error as GitRateLimitedError).retryAfterMs).toBe(30_000);
    expect(mock.requests).toHaveLength(1);
  });

  it("403 de permission : GitProviderError de base", async () => {
    const error = await caught(run(providerOn(failEverywhere(403))));
    expect(error.constructor).toBe(GitProviderError);
    expect(error).toMatchObject({ operation });
  });

  it("502 : GitProviderUnavailableError", async () => {
    const error = await caught(run(providerOn(failEverywhere(502))));
    expect(error).toBeInstanceOf(GitProviderUnavailableError);
    expect(error).toMatchObject({ operation });
  });
});

describe("TK-44a aucune fuite de secret", () => {
  describe.each([404, 403, 422, 500])("réponse %i dont le corps répète le secret", (status) => {
    it.each(calls)("%s", async (_operation, run) => {
      const logged: unknown[] = [];
      const consoles = (["log", "warn", "error", "info", "debug"] as const).map((m) =>
        vi.spyOn(console, m).mockImplementation(() => undefined),
      );
      const mock = failEverywhere(status, { "x-echo": SENTINEL }, `Bad ${SENTINEL}-token`);
      const provider = providerOn(mock, {
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

  it.each(calls)("%s : erreur réseau dont le message contient le secret", async (_o, run) => {
    const mock = createMockGitHub();
    mock.fetch = (async () => {
      throw new TypeError(`fetch failed for https://x.test/?access_token=${SENTINEL}-token`);
    }) as typeof fetch;

    const error = await caught(run(providerOn(mock)));

    expect(error).toBeInstanceOf(GitProviderError);
    for (const surface of surfaces(error)) expect(surface).not.toContain(SENTINEL);
    expect(error.cause).toBeUndefined();
  });

  it("le jeton n'apparaît dans aucune URL ni aucun corps de requête sortant", async () => {
    const mock = failEverywhere(404);
    const provider = providerOn(mock);
    await caught(provider.listFiles({ auth, repo: repoRef, ref: "cadrage" }));
    await caught(provider.listCommits({ auth, repo: repoRef, ref: "cadrage" }));

    for (const request of mock.requests) {
      expect(request.path).not.toContain(SENTINEL);
      expect(request.query.toString()).not.toContain(SENTINEL);
      expect(JSON.stringify(request.body ?? null)).not.toContain(SENTINEL);
    }
  });
});
