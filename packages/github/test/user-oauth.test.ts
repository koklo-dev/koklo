import { inspect } from "node:util";
import {
  GitAuthExpiredError,
  GitProviderError,
  GitProviderUnavailableError,
  InvalidUserCodeError,
} from "@koklo/domain";
import { describe, expect, it } from "vitest";
import {
  caught,
  createMockGitHub,
  installationAuth,
  NOW,
  providerOn,
  SENTINEL,
  userAuth,
} from "./support/mock-github.ts";

/** TK-48a1 AC-48-01 : forme des requêtes et des erreurs de l'adaptateur (transport simulé). */
const TOKEN_URL = "POST /login/oauth/access_token";
const INSTALLATIONS = "GET /user/installations";
const APP = "GET /app";
const REDIRECT = "https://app.koklo.test/api/github/callback";
const CODE = `${SENTINEL}-code`;
const granted = {
  access_token: "ghu_fresh",
  token_type: "bearer",
  expires_in: 28_800,
  refresh_token: "ghr_fresh",
  refresh_token_expires_in: 15_811_200,
};
const exchange = (provider: ReturnType<typeof providerOn>, code = CODE) =>
  provider.exchangeUserCode({ code, redirectUri: REDIRECT });
const asBody = (value: unknown) => value as Record<string, unknown>;

describe("exchangeUserCode : requête", () => {
  it("POST /login/oauth/access_token avec client_id, client_secret, code et redirect_uri", async () => {
    const mock = createMockGitHub({ [TOKEN_URL]: { body: granted } });
    await exchange(providerOn(mock));
    expect(mock.count(TOKEN_URL)).toBe(1);
    const request = mock.requests[0];
    expect(asBody(request?.body)).toMatchObject({
      client_id: "Iv1.fake-client",
      client_secret: "client-secret-fake",
      code: CODE,
      redirect_uri: REDIRECT,
    });
    expect(request?.headers.accept).toContain("application/json");
  });

  it("n'envoie ni le code ni le secret dans l'URL", async () => {
    const mock = createMockGitHub({ [TOKEN_URL]: { body: granted } });
    await exchange(providerOn(mock));
    expect(mock.requests[0]?.query.toString()).toBe("");
  });

  it("sans identifiants client : refus typé sans aucun appel réseau", async () => {
    const mock = createMockGitHub({ [TOKEN_URL]: { body: granted } });
    const provider = providerOn(mock, { clientId: undefined, clientSecret: undefined });
    const error = await caught(exchange(provider));
    expect(error).toBeInstanceOf(GitProviderError);
    expect(error).not.toBeInstanceOf(InvalidUserCodeError);
    expect(error).toMatchObject({ operation: "exchangeUserCode" });
    expect(mock.requests).toHaveLength(0);
  });
});

describe("exchangeUserCode : réponse", () => {
  it("convertit les durées relatives en instants ISO UTC depuis l'horloge injectée", async () => {
    const mock = createMockGitHub({ [TOKEN_URL]: { body: granted } });
    const credentials = await exchange(providerOn(mock));
    const at = (seconds: number) => new Date(Date.parse(NOW) + seconds * 1000).toISOString();
    expect(credentials).toEqual({
      token: "ghu_fresh",
      expiresAt: at(28_800),
      refreshToken: "ghr_fresh",
      refreshExpiresAt: at(15_811_200),
    });
  });

  it("jeton sans expiration ni rafraîchissement : champs omis, pas undefined", async () => {
    const mock = createMockGitHub({ [TOKEN_URL]: { body: { access_token: "ghu_forever" } } });
    const credentials = await exchange(providerOn(mock)).catch((error: unknown) => error);
    expect(credentials).toMatchObject({ token: "ghu_forever" });
    expect(credentials).not.toHaveProperty("refreshToken");
    expect(credentials).not.toHaveProperty("refreshExpiresAt");
  });

  it("bad_verification_code (HTTP 200) : InvalidUserCodeError", async () => {
    const mock = createMockGitHub({
      [TOKEN_URL]: { body: { error: "bad_verification_code", error_description: "expired" } },
    });
    const error = await caught(exchange(providerOn(mock)));
    expect(typeof InvalidUserCodeError).toBe("function");
    expect(error).toBeInstanceOf(InvalidUserCodeError);
    expect(error).toMatchObject({ operation: "exchangeUserCode" });
  });

  it.each([
    ["incorrect_client_credentials", { error: "incorrect_client_credentials" }],
    ["réponse sans jeton ni erreur", {}],
  ])("%s : GitProviderError générique, pas un code invalide", async (_label, body) => {
    const mock = createMockGitHub({ [TOKEN_URL]: { body } });
    const error = await caught(exchange(providerOn(mock)));
    expect(error).toBeInstanceOf(GitProviderError);
    expect(error).not.toBeInstanceOf(InvalidUserCodeError);
    expect(error).toMatchObject({ operation: "exchangeUserCode" });
  });

  it("5xx : GitProviderUnavailableError, jamais rejoué (l'échange n'est pas idempotent)", async () => {
    const mock = createMockGitHub({ [TOKEN_URL]: { status: 502, body: {} } });
    const provider = providerOn(mock, { retries: 3 });
    const error = await caught(exchange(provider));
    expect(error).toBeInstanceOf(GitProviderUnavailableError);
    expect(mock.count(TOKEN_URL)).toBe(1);
  });
});

describe("exchangeUserCode : aucun secret dans les erreurs ni le journal", () => {
  const failures: ReadonlyArray<readonly [string, Parameters<typeof createMockGitHub>[0]]> = [
    ["code refusé", { [TOKEN_URL]: { body: { error: "bad_verification_code" } } }],
    ["5xx", { [TOKEN_URL]: { status: 500, body: { message: `${CODE} ${SENTINEL}-secret` } } }],
    [
      "incorrect_client_credentials",
      { [TOKEN_URL]: { body: { error: "incorrect_client_credentials" } } },
    ],
  ];

  it.each(failures)("%s : ni le code ni le secret client", async (_label, routes) => {
    const entries: unknown[] = [];
    const provider = providerOn(createMockGitHub(routes), {
      clientSecret: `${SENTINEL}-secret`,
      logger: (entry) => entries.push(entry),
    });
    const error = await caught(exchange(provider));
    const seen = [
      error.message,
      error.stack ?? "",
      JSON.stringify(error),
      inspect(error, { depth: 6 }),
      JSON.stringify(entries),
    ].join("\n");
    expect(seen).not.toContain(SENTINEL);
    expect(entries).toEqual([
      expect.objectContaining({ operation: "exchangeUserCode", durationMs: expect.any(Number) }),
    ]);
  });
});

describe("listUserInstallations", () => {
  const account = (login: string, type: string) => ({ login, type });
  const page = (items: unknown[], next?: number) => ({
    body: { total_count: 3, installations: items },
    headers: next
      ? {
          link: `<https://api.github.com/user/installations?per_page=100&page=${next}>; rel="next"`,
        }
      : ({} as Record<string, string>),
  });

  it("GET /user/installations avec le jeton utilisateur, 100 par page", async () => {
    const mock = createMockGitHub({ [INSTALLATIONS]: page([]) });
    await providerOn(mock).listUserInstallations({ auth: userAuth("uat-liste") });
    expect(mock.requests[0]?.headers.authorization).toContain("uat-liste");
    expect(mock.requests[0]?.query.get("per_page")).toBe("100");
  });

  it("traduit id -> externalId (chaîne) et account.type -> ownerKind, sur toutes les pages", async () => {
    const mock = createMockGitHub({
      [INSTALLATIONS]: (request) =>
        Number(request.query.get("page") ?? "1") === 1
          ? page(
              [
                { id: 11, account: account("acme", "Organization") },
                { id: 12, account: account("octo", "User") },
              ],
              2,
            )
          : page([{ id: 13, account: account("zeta", "Organization") }]),
    });
    const listed = await providerOn(mock).listUserInstallations({ auth: userAuth() });
    expect(listed).toEqual([
      { externalId: "11", ownerKind: "organization", ownerLogin: "acme" },
      { externalId: "12", ownerKind: "user", ownerLogin: "octo" },
      { externalId: "13", ownerKind: "organization", ownerLogin: "zeta" },
    ]);
    expect(mock.count(INSTALLATIONS)).toBe(2);
  });

  it("ignore une installation sans compte lisible (jamais d'owner inventé)", async () => {
    const mock = createMockGitHub({
      [INSTALLATIONS]: page([
        { id: 21, account: null },
        { id: 22, account: account("acme", "Organization") },
        { id: 23, account: { type: "Organization" } },
      ]),
    });
    const listed = await providerOn(mock).listUserInstallations({ auth: userAuth() });
    expect(listed.map((i) => i.externalId)).toEqual(["22"]);
  });

  it("aucune installation : tableau vide", async () => {
    const mock = createMockGitHub({ [INSTALLATIONS]: page([]) });
    expect(await providerOn(mock).listUserInstallations({ auth: userAuth() })).toEqual([]);
  });

  it("401 : GitAuthExpiredError de kind user", async () => {
    const mock = createMockGitHub({
      [INSTALLATIONS]: { status: 401, body: { message: "Bad credentials" } },
    });
    const error = await caught(providerOn(mock).listUserInstallations({ auth: userAuth() }));
    expect(error).toBeInstanceOf(GitAuthExpiredError);
    expect(error).toMatchObject({ kind: "user", operation: "listUserInstallations" });
  });

  it("jeton d'installation : refus avant tout appel réseau", async () => {
    const mock = createMockGitHub({ [INSTALLATIONS]: page([]) });
    const error = await caught(
      providerOn(mock).listUserInstallations({ auth: installationAuth() }),
    );
    expect(error).toBeInstanceOf(GitProviderError);
    expect(error).toMatchObject({ operation: "listUserInstallations" });
    expect(mock.requests).toHaveLength(0);
  });

  it("le jeton utilisateur n'apparaît ni dans l'erreur ni dans le journal", async () => {
    const entries: unknown[] = [];
    const mock = createMockGitHub({ [INSTALLATIONS]: { status: 500, body: {} } });
    const provider = providerOn(mock, { logger: (entry) => entries.push(entry) });
    const error = await caught(
      provider.listUserInstallations({ auth: userAuth(`${SENTINEL}-token`) }),
    );
    const seen = [
      error.message,
      JSON.stringify(error),
      inspect(error, { depth: 6 }),
      JSON.stringify(entries),
    ];
    expect(seen.join("\n")).not.toContain(SENTINEL);
  });
});

describe("appSlug", () => {
  it("GET /app authentifié en JWT d'App (bearer à trois segments)", async () => {
    const mock = createMockGitHub({ [APP]: { body: { slug: "koklo-staging" } } });
    expect(await providerOn(mock).appSlug()).toBe("koklo-staging");
    expect(mock.requests[0]?.headers.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/i);
  });

  it("mis en cache : un seul appel pour deux lectures", async () => {
    const mock = createMockGitHub({ [APP]: { body: { slug: "koklo-staging" } } });
    const provider = providerOn(mock);
    expect(await provider.appSlug()).toBe(await provider.appSlug());
    expect(mock.count(APP)).toBe(1);
  });

  it("un échec n'est pas mis en cache : la lecture suivante réessaie", async () => {
    let calls = 0;
    const mock = createMockGitHub({
      [APP]: () =>
        calls++ === 0 ? { status: 502, body: {} } : { body: { slug: "koklo-staging" } },
    });
    const provider = providerOn(mock);
    expect(await caught(provider.appSlug())).toBeInstanceOf(GitProviderUnavailableError);
    expect(await provider.appSlug()).toBe("koklo-staging");
  });

  it("réponse sans slug : GitProviderError, rien n'est inventé", async () => {
    const mock = createMockGitHub({ [APP]: { body: { name: "Koklo" } } });
    const error = await caught(providerOn(mock).appSlug());
    expect(error).toBeInstanceOf(GitProviderError);
    expect(error).toMatchObject({ operation: "appSlug" });
  });
});
