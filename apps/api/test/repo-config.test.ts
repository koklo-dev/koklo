import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

/**
 * TK-43 CA11 : l'App GitHub est configurée en tout-ou-rien (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY,
 * GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET) : une configuration partielle fait échouer le démarrage.
 */
const APP_KEYS = [
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_APP_CLIENT_ID",
  "GITHUB_APP_CLIENT_SECRET",
] as const;

const BASE_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://u:p@h:5432/d",
  BETTER_AUTH_SECRET: "s".repeat(40),
  BETTER_AUTH_URL: "http://localhost:3000",
  GITHUB_CLIENT_ID: "better-auth-client-id",
  GITHUB_CLIENT_SECRET: "better-auth-client-secret",
};
const APP_ENV: Record<(typeof APP_KEYS)[number], string> = {
  GITHUB_APP_ID: "123456",
  GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nABCDEF\\n-----END PRIVATE KEY-----",
  GITHUB_APP_CLIENT_ID: "Iv1.app-client-id",
  GITHUB_APP_CLIENT_SECRET: "app-client-secret-VALUE",
};

const githubApp = (env: Record<string, string | undefined>) =>
  (loadConfig({ ...BASE_ENV, ...env }) as unknown as { githubApp?: Record<string, string> })
    .githubApp;

describe("configuration de l'App GitHub : tout ou rien", () => {
  it("aucune variable : pas d'App (githubApp absent), l'API démarre", () => {
    expect(githubApp({})).toBeUndefined();
  });

  it("variables vides (comme .env.example) : équivaut à aucune App", () => {
    expect(githubApp(Object.fromEntries(APP_KEYS.map((key) => [key, ""])))).toBeUndefined();
  });

  it("les quatre variables : App configurée, clé PEM aux retours à la ligne normalisés", () => {
    expect(githubApp(APP_ENV)).toEqual({
      appId: "123456",
      privateKey: "-----BEGIN PRIVATE KEY-----\nABCDEF\n-----END PRIVATE KEY-----",
      clientId: "Iv1.app-client-id",
      clientSecret: "app-client-secret-VALUE",
    });
  });

  it("n'altère pas l'OAuth App de Better Auth", () => {
    expect(loadConfig({ ...BASE_ENV, ...APP_ENV })).toMatchObject({
      githubClientId: "better-auth-client-id",
      githubClientSecret: "better-auth-client-secret",
    });
  });
});

describe("configuration partielle : échec au démarrage, noms seulement", () => {
  it.each(APP_KEYS)("%s manquante : l'échec nomme cette variable", (missing) => {
    const env = Object.fromEntries(
      APP_KEYS.filter((key) => key !== missing).map((key) => [key, APP_ENV[key]]),
    );
    expect(() => loadConfig({ ...BASE_ENV, ...env })).toThrow(new RegExp(missing));
  });

  it("une seule variable fournie : les trois autres sont nommées, la valeur ne l'est jamais", () => {
    let message = "";
    try {
      loadConfig({ ...BASE_ENV, GITHUB_APP_CLIENT_SECRET: "app-client-secret-VALUE" });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    for (const key of ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_CLIENT_ID"]) {
      expect(message).toContain(key);
    }
    expect(message).not.toContain("app-client-secret-VALUE");
  });

  it("une valeur vide parmi des valeurs renseignées compte pour manquante", () => {
    expect(() => loadConfig({ ...BASE_ENV, ...APP_ENV, GITHUB_APP_ID: "" })).toThrow(
      /GITHUB_APP_ID/,
    );
  });

  it(".env.example liste les quatre variables, vides", () => {
    const example = readFileSync(resolve(import.meta.dirname, "..", ".env.example"), "utf8");
    for (const key of APP_KEYS) expect(example).toMatch(new RegExp(`^${key}=\\s*$`, "m"));
  });
});
