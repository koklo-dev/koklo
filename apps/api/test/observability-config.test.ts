import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

const VALID_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://u:p@h:5432/d",
  BETTER_AUTH_SECRET: "s".repeat(40),
  BETTER_AUTH_URL: "http://localhost:3000",
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret-value",
};

function messageOf(env: Record<string, string | undefined>): string {
  try {
    loadConfig(env);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

describe("configuration d'observabilité (TK-19)", () => {
  it("sans SENTRY_DSN la config se charge, sentryDsn est absent et LOG_LEVEL vaut info", () => {
    const config = loadConfig(VALID_ENV);
    expect(config.sentryDsn).toBeUndefined();
    expect(config.logLevel).toBe("info");
  });

  it("SENTRY_DSN valide et LOG_LEVEL sont lus", () => {
    const config = loadConfig({
      ...VALID_ENV,
      SENTRY_DSN: "https://clef@glitchtip.example.com/1",
      LOG_LEVEL: "debug",
    });
    expect(config).toMatchObject({
      sentryDsn: "https://clef@glitchtip.example.com/1",
      logLevel: "debug",
    });
  });

  it("SENTRY_DSN vide est traité comme absent", () => {
    expect(loadConfig({ ...VALID_ENV, SENTRY_DSN: "" }).sentryDsn).toBeUndefined();
  });

  it("SENTRY_DSN non URL : échec nommant la variable, sans la valeur", () => {
    const message = messageOf({ ...VALID_ENV, SENTRY_DSN: "pas-une-url-secrete" });
    expect(message).toMatch(/SENTRY_DSN/);
    expect(message).not.toContain("pas-une-url-secrete");
  });

  it("LOG_LEVEL invalide : échec nommant la variable, sans la valeur", () => {
    const message = messageOf({ ...VALID_ENV, LOG_LEVEL: "bavard" });
    expect(message).toMatch(/LOG_LEVEL/);
    expect(message).not.toContain("bavard");
  });

  it.each(["fatal", "error", "warn", "info", "debug", "trace", "silent"])(
    "LOG_LEVEL=%s est accepté",
    (level) => {
      expect(loadConfig({ ...VALID_ENV, LOG_LEVEL: level }).logLevel).toBe(level);
    },
  );

  it(".env.example documente SENTRY_DSN (vide) et LOG_LEVEL", () => {
    const example = readFileSync(resolve(import.meta.dirname, "..", ".env.example"), "utf8");
    expect(example).toMatch(/^SENTRY_DSN=$/m);
    expect(example).toMatch(/^LOG_LEVEL=\w+$/m);
  });
});
