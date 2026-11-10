import { describe, expect, it } from "vitest";
import {
  createTokenCipher,
  credentialsAadOf,
  openUserCredentials,
  sealUserCredentials,
  TokenDecryptionError,
} from "../src/index.ts";

/** TK-93 lot A (B302) : forme stockée des jetons utilisateur, partagée par l'API et le worker. */
const cipher = createTokenCipher(Buffer.alloc(32, 3));
const CREDENTIALS = {
  token: "ghu_secret_token_value",
  refreshToken: "ghr_refresh_value",
  expiresAt: "2026-11-09T18:00:00.000Z",
  refreshExpiresAt: "2027-05-09T18:00:00.000Z",
};

describe("TK-93 codec des jetons utilisateur", () => {
  it("aller-retour : ce qui est scellé se rouvre à l'identique", () => {
    const row = sealUserCredentials(cipher, "u1", "i1", CREDENTIALS);
    expect(openUserCredentials(cipher, "u1", "i1", row)).toEqual(CREDENTIALS);
  });

  it("les jetons ne figurent jamais en clair dans la ligne ; les échéances restent lisibles", () => {
    const row = sealUserCredentials(cipher, "u1", "i1", CREDENTIALS);
    expect(Buffer.from(row.ciphertext).toString("utf8")).not.toContain("ghu_");
    expect(row.expiresAt.toISOString()).toBe(CREDENTIALS.expiresAt);
  });

  it("sans refresh : pas de clé refresh, échéance de refresh nulle", () => {
    const { token, expiresAt } = CREDENTIALS;
    const row = sealUserCredentials(cipher, "u1", "i1", { token, expiresAt });
    expect(row.refreshExpiresAt).toBeNull();
    expect(openUserCredentials(cipher, "u1", "i1", row)).toEqual({ token, expiresAt });
  });

  it("liée à l'utilisateur et à l'installation : une autre paire échoue franchement", () => {
    const row = sealUserCredentials(cipher, "u1", "i1", CREDENTIALS);
    expect(() => openUserCredentials(cipher, "u2", "i1", row)).toThrow(TokenDecryptionError);
    expect(() => openUserCredentials(cipher, "u1", "i2", row)).toThrow(TokenDecryptionError);
    expect(credentialsAadOf("u1", "i1")).toBe("u1:i1");
  });

  it("un clair authentifié mais mal formé est une corruption, sans citer son contenu", () => {
    const sealed = cipher.encrypt("pas du json {", credentialsAadOf("u1", "i1"));
    const row = {
      ciphertext: new Uint8Array(sealed.ciphertext),
      nonce: new Uint8Array(sealed.nonce),
      keyVersion: sealed.keyVersion,
      expiresAt: new Date(CREDENTIALS.expiresAt),
      refreshExpiresAt: null,
    };
    const failure = (() => {
      try {
        openUserCredentials(cipher, "u1", "i1", row);
      } catch (error) {
        return error as Error;
      }
      return undefined;
    })();
    expect(failure).toBeInstanceOf(TokenDecryptionError);
    expect(failure?.message).not.toContain("pas du json");
  });
});
