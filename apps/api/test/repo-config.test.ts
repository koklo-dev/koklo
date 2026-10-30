import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

/**
 * TK-43 CA11, révisé par le correctif HOTFIX-github-app-config : l'App GitHub se configure par la paire
 * tout-ou-rien GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY ; GITHUB_APP_CLIENT_ID + GITHUB_APP_CLIENT_SECRET
 * forment une seconde paire tout-ou-rien, optionnelle (futur flux de jeton utilisateur). Une paire
 * partielle fait échouer le démarrage.
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

  it("ID + clé seulement : App configurée, sans identifiants client", () => {
    expect(
      githubApp({
        GITHUB_APP_ID: APP_ENV.GITHUB_APP_ID,
        GITHUB_APP_PRIVATE_KEY: APP_ENV.GITHUB_APP_PRIVATE_KEY,
      }),
    ).toEqual({
      appId: "123456",
      privateKey: "-----BEGIN PRIVATE KEY-----\nABCDEF\n-----END PRIVATE KEY-----",
    });
  });

  it("ID + clé et identifiants client vides : équivaut à ID + clé seulement", () => {
    const app = githubApp({
      GITHUB_APP_ID: APP_ENV.GITHUB_APP_ID,
      GITHUB_APP_PRIVATE_KEY: APP_ENV.GITHUB_APP_PRIVATE_KEY,
      GITHUB_APP_CLIENT_ID: "",
      GITHUB_APP_CLIENT_SECRET: "",
    });
    expect(app).toBeDefined();
    expect(app).not.toHaveProperty("clientId");
    expect(app).not.toHaveProperty("clientSecret");
  });

  it("GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET (OAuth de connexion) ne sont jamais lus pour l'App", () => {
    expect(githubApp({})).toBeUndefined();
    const app = githubApp({
      GITHUB_APP_ID: APP_ENV.GITHUB_APP_ID,
      GITHUB_APP_PRIVATE_KEY: APP_ENV.GITHUB_APP_PRIVATE_KEY,
    });
    expect(JSON.stringify(app)).not.toContain("better-auth-client");
    expect(app).not.toHaveProperty("clientId");
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

const messageOf = (env: Record<string, string>): string => {
  try {
    loadConfig({ ...BASE_ENV, ...env });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
};

describe("configuration partielle : échec au démarrage, noms seulement", () => {
  it.each(["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY"] as const)(
    "%s manquante (l'autre fournie) : l'échec nomme cette variable seule",
    (missing) => {
      const other = missing === "GITHUB_APP_ID" ? "GITHUB_APP_PRIVATE_KEY" : "GITHUB_APP_ID";
      const message = messageOf({ [other]: APP_ENV[other] });
      expect(message).toContain(missing);
      expect(message).not.toContain(other);
      expect(message).not.toContain(APP_ENV[other]);
    },
  );

  it.each([
    ["GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET"],
    ["GITHUB_APP_CLIENT_SECRET", "GITHUB_APP_CLIENT_ID"],
  ] as const)("%s seule : l'échec nomme %s", (given, missing) => {
    const message = messageOf({
      GITHUB_APP_ID: APP_ENV.GITHUB_APP_ID,
      GITHUB_APP_PRIVATE_KEY: APP_ENV.GITHUB_APP_PRIVATE_KEY,
      [given]: APP_ENV[given],
    });
    expect(message).toContain(missing);
    expect(message).not.toContain(APP_ENV[given]);
  });

  it("CLIENT_ID seul, sans ID ni clé : échec (nomme l'ID de l'App)", () => {
    expect(() => loadConfig({ ...BASE_ENV, GITHUB_APP_CLIENT_ID: "Iv1.x" })).toThrow(
      /GITHUB_APP_ID/,
    );
  });

  it("une seule variable fournie : la valeur n'est jamais citée", () => {
    const message = messageOf({ GITHUB_APP_CLIENT_SECRET: "app-client-secret-VALUE" });
    expect(message).toContain("GITHUB_APP_ID");
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
