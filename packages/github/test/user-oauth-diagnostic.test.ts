import { inspect } from "node:util";
import {
  GitAuthExpiredError,
  GitProviderError,
  GitProviderUnavailableError,
  InvalidUserCodeError,
} from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { caught, createMockGitHub, providerOn, SENTINEL, userAuth } from "./support/mock-github.ts";

/** Correctif diagnostic : les erreurs de l'adaptateur portent le statut HTTP et un code OAuth public. */
const TOKEN_URL = "POST /login/oauth/access_token";
const REDIRECT = "https://app.koklo.test/api/github/callback";
const exchange = (provider: ReturnType<typeof providerOn>) =>
  provider.exchangeUserCode({ code: `${SENTINEL}-code`, redirectUri: REDIRECT });

describe("exchangeUserCode : diagnostic des refus HTTP 200 de GitHub", () => {
  it.each([
    "incorrect_client_credentials",
    "redirect_uri_mismatch",
    "unauthorized_client",
    "access_denied",
    "application_suspended",
    "bad_refresh_token",
  ])("%s : GitProviderError avec status 200 et oauthError", async (code) => {
    const mock = createMockGitHub({
      [TOKEN_URL]: { body: { error: code, error_description: `${SENTINEL}-desc` } },
    });
    const error = await caught(exchange(providerOn(mock)));
    expect(error).toBeInstanceOf(GitProviderError);
    expect(error).not.toBeInstanceOf(InvalidUserCodeError);
    expect(error).toMatchObject({ operation: "exchangeUserCode", status: 200, oauthError: code });
  });

  it("bad_verification_code : InvalidUserCodeError qui porte aussi le diagnostic", async () => {
    const mock = createMockGitHub({ [TOKEN_URL]: { body: { error: "bad_verification_code" } } });
    const error = await caught(exchange(providerOn(mock)));
    expect(error).toBeInstanceOf(InvalidUserCodeError);
    expect(error).toMatchObject({ status: 200, oauthError: "bad_verification_code" });
  });

  it("code d'erreur inconnu ou corps sans jeton : status 200 mais pas d'oauthError", async () => {
    for (const body of [{ error: `${SENTINEL}-inconnu` }, {}, { error: 42 }]) {
      const mock = createMockGitHub({ [TOKEN_URL]: { body } });
      const error = await caught(exchange(providerOn(mock)));
      expect(error).toMatchObject({ status: 200 });
      expect(error).not.toHaveProperty("oauthError");
    }
  });

  it("refus HTTP 4xx avec un code OAuth dans le corps : status et oauthError conservés", async () => {
    const mock = createMockGitHub({
      [TOKEN_URL]: { status: 400, body: { error: "redirect_uri_mismatch" } },
    });
    const error = await caught(exchange(providerOn(mock)));
    expect(error).toMatchObject({ status: 400, oauthError: "redirect_uri_mismatch" });
  });

  it("5xx : GitProviderUnavailableError avec status", async () => {
    const mock = createMockGitHub({ [TOKEN_URL]: { status: 502, body: {} } });
    const error = await caught(exchange(providerOn(mock)));
    expect(error).toBeInstanceOf(GitProviderUnavailableError);
    expect(error).toMatchObject({ status: 502 });
    expect(error).not.toHaveProperty("oauthError");
  });

  it("ni le corps, ni la cause, ni le code, ni le secret ne sont conservés", async () => {
    const mock = createMockGitHub({
      [TOKEN_URL]: {
        status: 400,
        body: { error: "access_denied", error_description: `${SENTINEL}-desc`, message: SENTINEL },
      },
    });
    const error = await caught(exchange(providerOn(mock, { clientSecret: `${SENTINEL}-secret` })));
    expect(error.cause).toBeUndefined();
    const seen = [
      error.message,
      error.stack ?? "",
      JSON.stringify(error),
      inspect(error, { depth: 6 }),
    ];
    expect(seen.join("\n")).not.toContain(SENTINEL);
  });
});

describe("autres appels : statut HTTP porté par l'erreur typée", () => {
  it("listUserInstallations 401 : GitAuthExpiredError avec status 401", async () => {
    const mock = createMockGitHub({
      "GET /user/installations": { status: 401, body: { message: "Bad credentials" } },
    });
    const error = await caught(providerOn(mock).listUserInstallations({ auth: userAuth() }));
    expect(error).toBeInstanceOf(GitAuthExpiredError);
    expect(error).toMatchObject({ status: 401 });
  });

  it("getUserOwnerRole 403 : status 403", async () => {
    const mock = createMockGitHub({
      "GET /user/memberships/orgs/acme": { status: 403, body: { message: "Forbidden" } },
    });
    const error = await caught(
      providerOn(mock).getUserOwnerRole({
        auth: userAuth(),
        owner: { kind: "organization", login: "acme" },
      }),
    );
    expect(error).toMatchObject({ operation: "getUserOwnerRole", status: 403 });
  });
});
