import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";

const BASE = { DATABASE_URL: "postgres://x" };

function messageOf(env: Record<string, string | undefined>): string {
  try {
    loadConfig(env);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

describe("configuration d'observabilité du worker (TK-19)", () => {
  it("sans SENTRY_DSN : se charge, logLevel info, appEnv development, appVersion dev", () => {
    const config = loadConfig(BASE);
    expect(config).toMatchObject({
      databaseUrl: "postgres://x",
      logLevel: "info",
      appEnv: "development",
      appVersion: "dev",
    });
    expect(config.sentryDsn).toBeUndefined();
  });

  it("lit SENTRY_DSN, LOG_LEVEL, APP_ENV et APP_VERSION", () => {
    expect(
      loadConfig({
        ...BASE,
        SENTRY_DSN: "https://clef@glitchtip.example.com/2",
        LOG_LEVEL: "warn",
        APP_ENV: "staging",
        WEB_BASE_URL: "https://app.koklo.dev",
        APP_VERSION: "1.2.3",
        // staging exige la configuration d'envoi (TK-22) ; hors sujet ici.
        RESEND_API_KEY: "re_test",
        MAIL_DOMAIN: "koklo.dev",
        EMAIL_FROM: "no-reply@koklo.dev",
      }),
    ).toMatchObject({
      sentryDsn: "https://clef@glitchtip.example.com/2",
      logLevel: "warn",
      appEnv: "staging",
      appVersion: "1.2.3",
    });
  });

  it("SENTRY_DSN non URL : échec nommant la variable, sans la valeur", () => {
    const message = messageOf({ ...BASE, SENTRY_DSN: "pas-une-url-secrete" });
    expect(message).toMatch(/SENTRY_DSN/);
    expect(message).not.toContain("pas-une-url-secrete");
  });

  it("LOG_LEVEL invalide : échec nommant la variable, sans la valeur", () => {
    const message = messageOf({ ...BASE, LOG_LEVEL: "bavard" });
    expect(message).toMatch(/LOG_LEVEL/);
    expect(message).not.toContain("bavard");
  });

  it("DATABASE_URL manquante reste refusée avec son message actuel", () => {
    expect(() => loadConfig({})).toThrow("DATABASE_URL is required");
  });
});
