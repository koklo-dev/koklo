import { describe, expect, it } from "vitest";
import {
  GIT_DENIALS,
  GitProviderError,
  GitProviderUnavailableError,
  gitDenialOf,
  InvalidUserCodeError,
  OAUTH_ERROR_CODES,
  oauthErrorCodeOf,
} from "../src/index.ts";

/** Diagnostic d'une erreur du fournisseur : statut HTTP et code OAuth public, rien d'autre. */
describe("oauthErrorCodeOf : liste blanche des codes OAuth publics de GitHub", () => {
  it.each([
    "bad_verification_code",
    "redirect_uri_mismatch",
    "incorrect_client_credentials",
    "unauthorized_client",
    "access_denied",
    "application_suspended",
    "device_flow_disabled",
    "incorrect_device_code",
    "expired_token",
    "bad_refresh_token",
  ])("%s est reconnu", (code) => {
    expect(OAUTH_ERROR_CODES).toContain(code);
    expect(oauthErrorCodeOf(code)).toBe(code);
  });

  it.each([
    ["autre chaîne", "ghu_canary-secret"],
    ["casse différente", "Bad_Verification_Code"],
    ["avec espace", "bad_verification_code "],
    ["nombre", 42],
    ["objet", { error: "access_denied" }],
    ["null", null],
    ["undefined", undefined],
  ])("%s : absent", (_label, value) => {
    expect(oauthErrorCodeOf(value)).toBeUndefined();
  });
});

describe("GitProviderError : diagnostic", () => {
  it("porte status et oauthError filtré, sans les rendre énumérables dans la cause ni le message", () => {
    const error = new GitProviderError("exchangeUserCode", undefined, {
      status: 200,
      oauthError: "redirect_uri_mismatch",
    });
    expect(error).toMatchObject({ status: 200, oauthError: "redirect_uri_mismatch" });
    expect(error.cause).toBeUndefined();
    expect(error.message).not.toContain("redirect_uri_mismatch");
  });

  it("filtre un oauthError hors liste blanche et un statut invalide", () => {
    const error = new GitProviderError("op", undefined, {
      status: 99_999,
      oauthError: "secret-canary" as never,
    });
    expect(error.oauthError).toBeUndefined();
    expect(error.status).toBeUndefined();
  });

  it("sans diagnostic : propriétés absentes (pas de clés undefined dans les journaux)", () => {
    const error = new GitProviderError("op");
    expect(Object.keys(error)).not.toContain("status");
    expect(Object.keys(error)).not.toContain("oauthError");
  });

  it("les sous-classes restent sans diagnostic par défaut", () => {
    expect(new GitProviderUnavailableError({ operation: "op" }).status).toBeUndefined();
    expect(new InvalidUserCodeError({ operation: "op" }).oauthError).toBeUndefined();
  });
});

describe("denial : motif d'un refus 403, énumération fermée", () => {
  it.each(GIT_DENIALS)("%s est reconnu", (denial) => {
    expect(gitDenialOf(denial)).toBe(denial);
  });

  it.each([
    ["texte libre", "Resource not accessible by integration"],
    ["jeton", "ghu_canary-secret"],
    ["nombre", 7],
    ["null", null],
    ["undefined", undefined],
  ])("%s : absent", (_label, value) => {
    expect(gitDenialOf(value)).toBeUndefined();
  });

  it("GitProviderError porte denial (non rendu dans le message) et filtre toute valeur hors liste", () => {
    const error = new GitProviderError("op", undefined, { status: 403, denial: "app_blocked" });
    expect(error.denial).toBe("app_blocked");
    expect(error.message).not.toContain("app_blocked");
    const bad = new GitProviderError("op", undefined, { denial: "ghu_canary" as never });
    expect(bad.denial).toBeUndefined();
    expect(Object.keys(new GitProviderError("op"))).not.toContain("denial");
  });
});
