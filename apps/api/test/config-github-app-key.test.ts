import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

/**
 * TK-43 : l'infra fournit `GH_APP_PRIVATE_KEY` en une ligne base64 (docs/quality-and-operations.md) ;
 * l'API la décode, et accepte aussi un PEM aux `\n` littéraux (voir repo-config.test.ts).
 */
const PEM = "-----BEGIN PRIVATE KEY-----\nABCDEF\n-----END PRIVATE KEY-----\n";
const ENV = {
  DATABASE_URL: "postgresql://u:p@h:5432/d",
  BETTER_AUTH_SECRET: "s".repeat(40),
  BETTER_AUTH_URL: "http://localhost:3000",
  GITHUB_CLIENT_ID: "id",
  GITHUB_CLIENT_SECRET: "secret",
  GITHUB_APP_ID: "123456",
  GITHUB_APP_CLIENT_ID: "Iv1.x",
  GITHUB_APP_CLIENT_SECRET: "app-secret",
};

describe("GITHUB_APP_PRIVATE_KEY", () => {
  it("base64 sur une ligne : décodée en PEM", () => {
    const key = Buffer.from(PEM).toString("base64");
    expect(loadConfig({ ...ENV, GITHUB_APP_PRIVATE_KEY: key }).githubApp?.privateKey).toBe(PEM);
  });

  it("PEM multi-lignes : inchangé", () => {
    expect(loadConfig({ ...ENV, GITHUB_APP_PRIVATE_KEY: PEM }).githubApp?.privateKey).toBe(PEM);
  });

  it("valeur qui n'est ni un PEM ni du base64 de PEM : conservée telle quelle", () => {
    expect(
      loadConfig({ ...ENV, GITHUB_APP_PRIVATE_KEY: "pas-une-cle" }).githubApp?.privateKey,
    ).toBe("pas-une-cle");
  });
});
