import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

/** TK-45c1 : `GITHUB_WEBHOOK_SECRET` -> `AppConfig.githubWebhookSecret`, indépendant de `githubApp`. */
const ENV = {
  DATABASE_URL: "postgresql://u:p@h:5432/d",
  BETTER_AUTH_SECRET: "s".repeat(40),
  BETTER_AUTH_URL: "http://localhost:3000",
  GITHUB_CLIENT_ID: "id",
  GITHUB_CLIENT_SECRET: "secret",
};
const SECRET = "whsec-valeur-secrete-de-test-0123456789";

describe("GITHUB_WEBHOOK_SECRET", () => {
  it("présent : porté tel quel par la configuration", () => {
    expect(loadConfig({ ...ENV, GITHUB_WEBHOOK_SECRET: SECRET })).toMatchObject({
      githubWebhookSecret: SECRET,
    });
  });

  it("absent ou vide : la configuration se charge sans secret (l'API démarre)", () => {
    expect(loadConfig(ENV).githubWebhookSecret).toBeUndefined();
    expect(loadConfig({ ...ENV, GITHUB_WEBHOOK_SECRET: "" }).githubWebhookSecret).toBeUndefined();
  });

  it("indépendant de la GitHub App : lu sans GITHUB_APP_*", () => {
    const config = loadConfig({ ...ENV, GITHUB_WEBHOOK_SECRET: SECRET });
    expect(config.githubApp).toBeUndefined();
    expect(config.githubWebhookSecret).toBe(SECRET);
  });

  it("une erreur de configuration ne cite jamais la valeur du secret", () => {
    let message = "";
    try {
      loadConfig({ ...ENV, GITHUB_WEBHOOK_SECRET: SECRET, DATABASE_URL: "" });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toBe("");
    expect(message).not.toContain(SECRET);
  });

  it(".env.example documente la variable, sans valeur", () => {
    const example = readFileSync(resolve(import.meta.dirname, "..", ".env.example"), "utf8");
    expect(example).toMatch(/^GITHUB_WEBHOOK_SECRET=$/m);
  });
});
