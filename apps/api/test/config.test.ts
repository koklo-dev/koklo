import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

const envExample = readFileSync(resolve(import.meta.dirname, "..", ".env.example"), "utf8");

const exampleKeys = envExample
  .split("\n")
  .filter((line) => /^[A-Z_]+=/.test(line))
  .map((line) => line.split("=")[0] as string);

const SECRET = "s".repeat(40);
const VALID_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://u:p@h:5432/d",
  BETTER_AUTH_SECRET: SECRET,
  BETTER_AUTH_URL: "http://localhost:3000",
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret-value",
};

/** Enregistre chaque variable que le code lit réellement. */
function readKeys(): string[] {
  const read = new Set<string>();
  const env = new Proxy(VALID_ENV, {
    get(target, key) {
      if (typeof key === "string") read.add(key);
      return target[key as string];
    },
  });
  loadConfig(env);
  return [...read].sort();
}

function messageOf(env: Record<string, string | undefined>): string {
  try {
    loadConfig(env);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

describe("configuration (C3.3)", () => {
  it(".env.example contient exactement les variables lues par le code", () => {
    expect(readKeys()).toEqual([...exampleKeys].sort());
    expect([...exampleKeys].sort()).toEqual([
      "APP_ENV",
      "APP_VERSION",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "DATABASE_URL",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "PORT",
    ]);
  });

  it(".env.example ne contient aucun secret : mot de passe de dev local uniquement", () => {
    expect(envExample).not.toMatch(/(secret|token|api[_-]?key)=\S+/i);
  });

  it("lit les valeurs fournies et applique les défauts (PORT 3000, version dev)", () => {
    expect(loadConfig(VALID_ENV)).toMatchObject({
      databaseUrl: "postgresql://u:p@h:5432/d",
      port: 3000,
      appVersion: "dev",
    });
    expect(loadConfig({ ...VALID_ENV, PORT: "8080", APP_VERSION: "2.0.1" })).toMatchObject({
      port: 8080,
      appVersion: "2.0.1",
    });
  });

  it("DATABASE_URL manquante : échec clair au démarrage", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});

describe("configuration d'authentification (TK-11 C3, C2.d)", () => {
  it("C3 expose les 4 variables d'auth et exactement 8 clés de configuration", () => {
    const config = loadConfig(VALID_ENV);
    expect(config).toMatchObject({
      betterAuthSecret: SECRET,
      betterAuthUrl: "http://localhost:3000",
      githubClientId: "client-id",
      githubClientSecret: "client-secret-value",
    });
    // C2.d : aucun drapeau de session de test dans la configuration, quel que soit APP_ENV.
    expect(Object.keys(config).sort()).toEqual([
      "appEnv",
      "appVersion",
      "betterAuthSecret",
      "betterAuthUrl",
      "databaseUrl",
      "githubClientId",
      "githubClientSecret",
      "port",
    ]);
    expect(Object.keys(loadConfig({ ...VALID_ENV, APP_ENV: "production" }))).toHaveLength(8);
  });

  // Infra injecte APP_ENV = nom de l'environnement déployé : l'api doit démarrer en staging.
  it.each(["development", "staging", "production"])("APP_ENV=%s est accepté", (appEnv) => {
    expect(loadConfig({ ...VALID_ENV, APP_ENV: appEnv }).appEnv).toBe(appEnv);
  });

  it("APP_ENV inconnu : échec nommant la variable", () => {
    expect(() => loadConfig({ ...VALID_ENV, APP_ENV: "preprod" })).toThrow(/APP_ENV/);
  });

  it.each(["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"])(
    "C3.a %s manquante : échec nommant la variable",
    (name) => {
      const { [name]: _removed, ...env } = VALID_ENV;
      expect(() => loadConfig(env)).toThrow(new RegExp(name));
    },
  );

  it("C3.b BETTER_AUTH_URL doit être une URL absolue valide", () => {
    expect(() => loadConfig({ ...VALID_ENV, BETTER_AUTH_URL: "pas-une-url" })).toThrow(
      /BETTER_AUTH_URL/,
    );
    expect(() => loadConfig({ ...VALID_ENV, BETTER_AUTH_URL: "/relative" })).toThrow(
      /BETTER_AUTH_URL/,
    );
  });

  it("C3.b BETTER_AUTH_SECRET fait au moins 32 caractères", () => {
    expect(() => loadConfig({ ...VALID_ENV, BETTER_AUTH_SECRET: "court" })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
    expect(loadConfig({ ...VALID_ENV, BETTER_AUTH_SECRET: "x".repeat(32) }).betterAuthSecret).toBe(
      "x".repeat(32),
    );
  });
});

describe("configuration d'authentification : exemple et messages (TK-11 C3.c, C3.d)", () => {
  it("C3.c .env.example : secrets vides, identifiant et URL d'exemple renseignés", () => {
    expect(envExample).toMatch(/^BETTER_AUTH_SECRET=\s*$/m);
    expect(envExample).toMatch(/^GITHUB_CLIENT_SECRET=\s*$/m);
    expect(envExample).toMatch(/^BETTER_AUTH_URL=http:\/\/localhost:3000\s*$/m);
    expect(envExample).toMatch(/^GITHUB_CLIENT_ID=\S*$/m);
  });

  it("C3.d aucune valeur de secret dans les messages d'erreur de configuration", () => {
    const tooShort = messageOf({ ...VALID_ENV, BETTER_AUTH_SECRET: "tiny-secret-value" });
    expect(tooShort).toMatch(/BETTER_AUTH_SECRET/);
    expect(tooShort).not.toContain("tiny-secret-value");
    const badUrl = messageOf({ ...VALID_ENV, BETTER_AUTH_URL: "pas-une-url" });
    expect(badUrl).toMatch(/BETTER_AUTH_URL/);
    expect(badUrl).not.toContain(SECRET);
    expect(badUrl).not.toContain("client-secret-value");
    const missing = messageOf({ ...VALID_ENV, GITHUB_CLIENT_ID: undefined });
    expect(missing).toMatch(/GITHUB_CLIENT_ID/);
    expect(missing).not.toContain(SECRET);
    expect(missing).not.toContain("client-secret-value");
  });
});
