import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config.ts";
import { createMailSender } from "./mail/create-mail-sender.ts";

/**
 * TK-22 C7/C8 : choix de l'adaptateur d'envoi selon l'environnement, et démarrage refusé en
 * staging/production quand la configuration d'envoi est incomplète. Le message d'erreur nomme la
 * variable, jamais sa valeur.
 */
vi.mock("resend", () => ({
  Resend: class {
    constructor() {
      throw new Error("Resend ne doit pas être instancié sans clé");
    }
  },
}));

const BASE = { DATABASE_URL: "postgres://x" };
const FULL = {
  RESEND_API_KEY: "re_secret_value_123",
  MAIL_DOMAIN: "koklo.dev",
  EMAIL_FROM: "Koklo <no-reply@koklo.dev>",
};

function messageOf(env: Record<string, string | undefined>): string {
  try {
    loadConfig(env);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

describe("configuration d'envoi d'emails du worker (TK-22 C7)", () => {
  it.each(["development", "test"])("%s sans clé Resend : adaptateur de capture", (appEnv) => {
    expect(loadConfig({ ...BASE, APP_ENV: appEnv }).mail).toEqual({ kind: "capture" });
  });

  it("sans APP_ENV (défaut development) et sans clé : capture", () => {
    expect(loadConfig(BASE).mail).toEqual({ kind: "capture" });
  });

  it("avec RESEND_API_KEY, MAIL_DOMAIN et EMAIL_FROM : adaptateur Resend", () => {
    expect(
      loadConfig({ ...BASE, APP_ENV: "production", WEB_BASE_URL: "https://app.koklo.dev", ...FULL })
        .mail,
    ).toEqual({
      kind: "resend",
      apiKey: FULL.RESEND_API_KEY,
      domain: FULL.MAIL_DOMAIN,
      from: FULL.EMAIL_FROM,
    });
  });

  it.each(["staging", "production"])("%s : chaque variable manquante est nommée", (appEnv) => {
    for (const missing of ["RESEND_API_KEY", "MAIL_DOMAIN", "EMAIL_FROM"] as const) {
      const env = { ...BASE, APP_ENV: appEnv, ...FULL, [missing]: undefined };
      const message = messageOf(env);
      expect(message, `${appEnv} sans ${missing}`).toContain(missing);
    }
  });

  it("une variable vide compte comme manquante en production", () => {
    expect(messageOf({ ...BASE, APP_ENV: "production", ...FULL, RESEND_API_KEY: "" })).toContain(
      "RESEND_API_KEY",
    );
  });

  it("le message d'échec ne contient jamais la valeur d'une variable", () => {
    const message = messageOf({ ...BASE, APP_ENV: "production", ...FULL, MAIL_DOMAIN: undefined });
    expect(message).toContain("MAIL_DOMAIN");
    expect(message).not.toContain(FULL.RESEND_API_KEY);
    expect(message).not.toContain(FULL.EMAIL_FROM);
  });

  it("EMAIL_FROM doit appartenir à MAIL_DOMAIN : l'erreur nomme EMAIL_FROM sans sa valeur", () => {
    const from = "Koklo <no-reply@autre-domaine.test>";
    const message = messageOf({ ...BASE, APP_ENV: "production", ...FULL, EMAIL_FROM: from });
    expect(message).toContain("EMAIL_FROM");
    expect(message).not.toContain("autre-domaine.test");
  });
});

describe("création de l'adaptateur (TK-22 C8 : aucun secret requis)", () => {
  it("capture : aucun appel au SDK Resend, aucune clé nécessaire", () => {
    const previous = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      expect(() => createMailSender({ kind: "capture" })).not.toThrow();
    } finally {
      if (previous !== undefined) {
        process.env.RESEND_API_KEY = previous;
      }
    }
  });
});
