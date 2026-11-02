import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { CaptureMailSender } from "../src/mail/capture-mail-sender.ts";
import { createMailSender } from "../src/mail/create-mail-sender.ts";
import { ResendMailSender } from "../src/mail/resend-mail-sender.ts";

/**
 * TK-58b : `WEB_BASE_URL` (origine publique du web, base des liens d'e-mail). Obligatoire en
 * staging/production, https, sans identifiants ni chemin/requête/fragment ; le message d'échec nomme la
 * variable sans citer la valeur. Et : staging/production ne choisissent JAMAIS la capture.
 */
const BASE = { DATABASE_URL: "postgresql://u:p@h:5432/d" };
const MAIL = {
  RESEND_API_KEY: "re_secret_value_123",
  MAIL_DOMAIN: "koklo.dev",
  EMAIL_FROM: "Koklo <no-reply@koklo.dev>",
};
const worker = resolve(import.meta.dirname, "..");

const webBaseUrlOf = (env: Record<string, string | undefined>) =>
  (loadConfig(env) as unknown as { webBaseUrl?: string }).webBaseUrl;

function messageOf(env: Record<string, string | undefined>): string {
  try {
    loadConfig(env);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

describe("WEB_BASE_URL : valeurs acceptées", () => {
  it.each(["staging", "production"])("%s : https accepté et normalisé en origine", (appEnv) => {
    const env = { ...BASE, ...MAIL, APP_ENV: appEnv };
    expect(webBaseUrlOf({ ...env, WEB_BASE_URL: "https://app.koklo.dev" })).toBe(
      "https://app.koklo.dev",
    );
    expect(webBaseUrlOf({ ...env, WEB_BASE_URL: "https://app.koklo.dev/" })).toBe(
      "https://app.koklo.dev",
    );
    expect(webBaseUrlOf({ ...env, WEB_BASE_URL: "https://app.koklo.dev:8443" })).toBe(
      "https://app.koklo.dev:8443",
    );
  });

  it.each(["development", "test", undefined])(
    "%s sans valeur : défaut local http://localhost:3000",
    (appEnv) => {
      const env = appEnv === undefined ? BASE : { ...BASE, APP_ENV: appEnv };
      expect(webBaseUrlOf(env)).toBe("http://localhost:3000");
    },
  );

  it.each(["development", "test"])("%s : http local explicite accepté", (appEnv) => {
    expect(webBaseUrlOf({ ...BASE, APP_ENV: appEnv, WEB_BASE_URL: "http://localhost:4000" })).toBe(
      "http://localhost:4000",
    );
  });
});

describe("WEB_BASE_URL : valeurs refusées", () => {
  it.each(["staging", "production"])(
    "%s : absente ou vide = échec nommant la variable",
    (appEnv) => {
      const env = { ...BASE, ...MAIL, APP_ENV: appEnv };
      expect(messageOf(env)).toContain("WEB_BASE_URL");
      expect(messageOf({ ...env, WEB_BASE_URL: "" })).toContain("WEB_BASE_URL");
    },
  );

  it.each(["staging", "production"])("%s : http refusé (https exigé)", (appEnv) => {
    const message = messageOf({
      ...BASE,
      ...MAIL,
      APP_ENV: appEnv,
      WEB_BASE_URL: "http://app.koklo.dev",
    });
    expect(message).toContain("WEB_BASE_URL");
    expect(message).not.toContain("app.koklo.dev");
  });

  it.each([
    "not a url",
    "app.koklo.dev",
    "javascript:alert(1)",
    "ftp://app.koklo.dev",
    "https://user:pa55w0rd-SECRET@app.koklo.dev",
    "https://user@app.koklo.dev",
    "https://app.koklo.dev/path",
    "https://app.koklo.dev/?next=/x",
    "https://app.koklo.dev/#frag",
    "https://",
    "//app.koklo.dev",
  ])("%j : refusé dans tous les environnements, sans citer la valeur", (value) => {
    for (const appEnv of ["development", "staging", "production"]) {
      const env = { ...BASE, ...MAIL, APP_ENV: appEnv, WEB_BASE_URL: value };
      const message = messageOf(env);
      expect(message, `${appEnv} ${value}`).toContain("WEB_BASE_URL");
      expect(message).not.toContain("pa55w0rd-SECRET");
      expect(message).not.toContain("app.koklo.dev");
    }
  });

  it("la configuration chargée ne contient jamais d'identifiants dans webBaseUrl", () => {
    const value = webBaseUrlOf({
      ...BASE,
      ...MAIL,
      APP_ENV: "production",
      WEB_BASE_URL: "https://app.koklo.dev",
    });
    expect(value).not.toMatch(/@/);
  });
});

describe("l'adaptateur de capture n'est jamais choisi en staging/production", () => {
  const WEB = { WEB_BASE_URL: "https://app.koklo.dev" };

  it.each(["staging", "production"])(
    "%s sans clé : démarrage refusé (pas de repli sur la capture)",
    (appEnv) => {
      expect(messageOf({ ...BASE, ...WEB, APP_ENV: appEnv })).toContain("RESEND_API_KEY");
      expect(messageOf({ ...BASE, ...WEB, APP_ENV: appEnv, RESEND_API_KEY: "" })).toContain(
        "RESEND_API_KEY",
      );
    },
  );

  it.each(["staging", "production"])("%s avec clé : Resend, jamais la capture", (appEnv) => {
    const sender = createMailSender(loadConfig({ ...BASE, ...WEB, ...MAIL, APP_ENV: appEnv }).mail);
    expect(sender).toBeInstanceOf(ResendMailSender);
    expect(sender).not.toBeInstanceOf(CaptureMailSender);
  });

  it.each(["prod", "Production", "STAGING", "preprod", "live", " production"])(
    "environnement non reconnu %j sans clé : échec (fermé par défaut), jamais la capture",
    (appEnv) => {
      expect(messageOf({ ...BASE, ...WEB, APP_ENV: appEnv })).toContain("RESEND_API_KEY");
    },
  );

  it("development avec clé : Resend ; development/test sans clé : capture", () => {
    expect(
      createMailSender(loadConfig({ ...BASE, ...MAIL, APP_ENV: "development" }).mail),
    ).toBeInstanceOf(ResendMailSender);
    for (const appEnv of ["development", "test"]) {
      expect(createMailSender(loadConfig({ ...BASE, APP_ENV: appEnv }).mail)).toBeInstanceOf(
        CaptureMailSender,
      );
    }
  });
});

describe("parité entre la configuration lue et .env.example", () => {
  const example = readFileSync(join(worker, ".env.example"), "utf8");
  const exampleKeys = [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1] as string);
  const configSource = readFileSync(join(worker, "src", "config.ts"), "utf8");
  const githubSource = readFileSync(
    resolve(worker, "..", "..", "packages", "github", "src", "app-config.ts"),
    "utf8",
  );
  const readKeys = [...configSource.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)].map(
    (m) => m[1] as string,
  );

  it("WEB_BASE_URL est documentée dans .env.example avec une valeur locale", () => {
    expect(example).toMatch(/^WEB_BASE_URL=http:\/\/localhost:3000$/m);
  });

  it("chaque variable lue par src/config.ts figure dans .env.example", () => {
    expect(readKeys).toContain("WEB_BASE_URL");
    for (const key of new Set(readKeys)) {
      expect(exampleKeys, key).toContain(key);
    }
  });

  it("chaque variable de .env.example est lue par le worker ou par la configuration GitHub", () => {
    const sources = `${configSource}\n${githubSource}`;
    for (const key of exampleKeys) {
      expect(sources, key).toContain(key);
    }
  });
});

describe("production sans APP_ENV connu (revue TK-58 NB-1, NB-8)", () => {
  const WEB = { WEB_BASE_URL: "https://app.koklo.dev" };

  it("NODE_ENV=production sans APP_ENV : démarrage refusé (APP_ENV nommée)", () => {
    expect(messageOf({ ...BASE, NODE_ENV: "production" })).toContain("APP_ENV");
    expect(messageOf({ ...BASE, ...WEB, NODE_ENV: "production" })).toContain("APP_ENV");
  });

  it("NODE_ENV=production avec APP_ENV=development et sans clé : jamais la capture", () => {
    const message = messageOf({ ...BASE, NODE_ENV: "production", APP_ENV: "development" });
    expect(message).toMatch(/APP_ENV|RESEND_API_KEY/);
  });

  it("NODE_ENV=production avec une configuration complète : accepté", () => {
    const config = loadConfig({
      ...BASE,
      ...MAIL,
      ...WEB,
      NODE_ENV: "production",
      APP_ENV: "production",
    });
    expect(config.mail.kind).toBe("resend");
  });

  it.each(["prod", "live", "preprod"])(
    "APP_ENV %j non reconnu sans WEB_BASE_URL : échec, pas de repli sur localhost",
    (appEnv) => {
      expect(messageOf({ ...BASE, ...MAIL, APP_ENV: appEnv })).toContain("WEB_BASE_URL");
    },
  );

  it("webBaseUrl est obligatoire dans WorkerConfig et le worker n'a plus de repli localhost", () => {
    const worker_ = readFileSync(join(worker, "src/worker.ts"), "utf8");
    expect(worker_).not.toContain("LOCAL_WEB_BASE_URL");
    const config = readFileSync(join(worker, "src/config.ts"), "utf8");
    expect(config).toMatch(/\bwebBaseUrl: string;/);
  });
});
