import { GitAuthExpiredError, GitNotFoundError, type GitUserCredentials } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { caught, createMockGitHub, ORG, PERSON, providerOn } from "./support/mock-github.ts";

const TOKEN = "POST /app/installations/1001/access_tokens";
const CHECK = "POST /applications/Iv1.fake-client/token";
const REFRESH = "POST /login/oauth/access_token";
const installation = { id: "1001", owner: ORG };
const personal = { id: "1002", owner: PERSON };
const issued = (expiresAt: string) => ({
  status: 201,
  body: { token: "iat-fake", expires_at: expiresAt },
});
const valid: GitUserCredentials = { token: "uat-fake", expiresAt: "2026-10-30T20:00:00.000Z" };

describe("authenticate : jeton d'installation", () => {
  it("rend le jeton de GitHub avec son expiration ISO UTC", async () => {
    const mock = createMockGitHub({ [TOKEN]: issued("2026-10-30T13:00:00Z") });
    const auth = await providerOn(mock).authenticate({ installation });
    expect(auth).toEqual({
      kind: "installation",
      token: "iat-fake",
      expiresAt: "2026-10-30T13:00:00.000Z",
    });
    expect(mock.count(TOKEN)).toBe(1);
    expect(mock.requests[0]?.headers.authorization).toMatch(/^bearer /i);
  });

  it("renouvelle un jeton qui expire dans moins de cinq minutes", async () => {
    let calls = 0;
    const mock = createMockGitHub({
      [TOKEN]: () => issued(calls++ === 0 ? "2026-10-30T12:02:00Z" : "2026-10-30T13:00:00Z"),
    });
    const auth = await providerOn(mock).authenticate({ installation });
    expect(auth.expiresAt).toBe("2026-10-30T13:00:00.000Z");
    expect(mock.count(TOKEN)).toBe(2);
  });

  it("installation inconnue (404) : GitNotFoundError", async () => {
    const mock = createMockGitHub({ [TOKEN]: { status: 404, body: { message: "Not Found" } } });
    expect(await caught(providerOn(mock).authenticate({ installation }))).toBeInstanceOf(
      GitNotFoundError,
    );
  });

  it("identifiant non numérique : GitNotFoundError sans requête", async () => {
    const mock = createMockGitHub();
    const error = await caught(
      providerOn(mock).authenticate({ installation: { id: "abc", owner: ORG } }),
    );
    expect(error).toBeInstanceOf(GitNotFoundError);
    expect(mock.requests).toEqual([]);
  });
});

describe("authenticate : jeton utilisateur", () => {
  it("jeton valide : validé auprès de GitHub avec le secret client, rendu tel quel", async () => {
    const mock = createMockGitHub({ [CHECK]: { body: { token: "uat-fake" } } });
    const auth = await providerOn(mock).authenticate({ installation: personal, user: valid });
    expect(auth).toEqual({ kind: "user", ...valid });
    const [request] = mock.requests;
    expect(request?.body).toMatchObject({ access_token: "uat-fake" });
    expect(request?.headers.authorization).toMatch(/^basic /i);
  });

  it("jeton refusé par GitHub (404) : GitAuthExpiredError non rafraîchissable", async () => {
    const mock = createMockGitHub({ [CHECK]: { status: 404, body: { message: "Not Found" } } });
    const error = await caught(
      providerOn(mock).authenticate({ installation: personal, user: valid }),
    );
    expect(error).toBeInstanceOf(GitAuthExpiredError);
    expect(error).toMatchObject({ kind: "user", refreshable: false });
  });

  it("jeton expiré avec refreshToken valide : rafraîchi, horodatages sur l'horloge injectée", async () => {
    const mock = createMockGitHub({
      [REFRESH]: {
        body: {
          access_token: "uat-new",
          expires_in: 28_800,
          refresh_token: "ref-new",
          refresh_token_expires_in: 15_811_200,
        },
      },
    });
    const auth = await providerOn(mock).authenticate({
      installation: personal,
      user: { token: "uat-old", expiresAt: "2026-10-30T11:00:00.000Z", refreshToken: "ref-old" },
    });
    expect(auth).toEqual({
      kind: "user",
      token: "uat-new",
      expiresAt: "2026-10-30T20:00:00.000Z",
      refreshToken: "ref-new",
      refreshExpiresAt: "2027-05-01T12:00:00.000Z",
    });
    expect(mock.requests[0]?.body).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "ref-old",
    });
  });

  it("refresh refusé par GitHub (200 avec error) : GitAuthExpiredError non rafraîchissable", async () => {
    const mock = createMockGitHub({ [REFRESH]: { body: { error: "bad_refresh_token" } } });
    const error = await caught(
      providerOn(mock).authenticate({
        installation: personal,
        user: { token: "x", expiresAt: "2026-10-30T11:00:00.000Z", refreshToken: "ref-old" },
      }),
    );
    expect(error).toMatchObject({ kind: "user", refreshable: false });
  });

  it.each([
    ["sans refreshToken", { token: "x", expiresAt: "2026-10-30T11:00:00.000Z" }],
    [
      "avec un refreshToken lui-même expiré",
      {
        token: "x",
        expiresAt: "2026-10-30T11:00:00.000Z",
        refreshToken: "r",
        refreshExpiresAt: "2026-10-30T11:30:00.000Z",
      },
    ],
  ] as const)("jeton expiré %s : GitAuthExpiredError sans requête", async (_label, user) => {
    const mock = createMockGitHub();
    const error = await caught(providerOn(mock).authenticate({ installation: personal, user }));
    expect(error).toBeInstanceOf(GitAuthExpiredError);
    expect(error).toMatchObject({ kind: "user", refreshable: false });
    expect(mock.requests).toEqual([]);
  });
});
