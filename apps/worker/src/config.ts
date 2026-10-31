import {
  WEBHOOK_RETENTION_DAYS_DEFAULT,
  WEBHOOK_RETENTION_DAYS_MAX,
  WEBHOOK_RETENTION_DAYS_MIN,
} from "@koklo/domain";
import { type GithubAppSettings, githubAppFromEnv } from "@koklo/github";
import { LOG_LEVELS, type LogLevel } from "@koklo/observability";

/** Envoi d'emails : capture en mémoire (développement, test) ou Resend (staging, production). */
export type MailConfig =
  | { readonly kind: "capture" }
  | {
      readonly kind: "resend";
      readonly apiKey: string;
      readonly domain: string;
      readonly from: string;
    };

export type WorkerConfig = {
  readonly databaseUrl: string;
  readonly appEnv: string;
  readonly appVersion: string;
  readonly logLevel: LogLevel;
  /** DSN GlitchTip/Sentry ; absent : le SDK d'erreurs reste désactivé. */
  readonly sentryDsn: string | undefined;
  readonly mail: MailConfig;
  /** Absent : fournisseur git non configuré (staging sans App) ; les lots `spec-write` échouent en `PROVIDER_UNAVAILABLE`. */
  readonly githubApp?: GithubAppSettings;
  /** Rétention des livraisons de webhook, en jours (`WEBHOOK_RETENTION_DAYS`, 1 à 365). `loadConfig` la renseigne toujours (défaut 30) ; absente, le défaut s'applique. */
  readonly webhookRetentionDays?: number;
};

function fail(variable: string, rule: string): never {
  throw new Error(`${variable} ${rule}`);
}

function parseLogLevel(value: string | undefined): LogLevel {
  if (value === undefined || value === "") {
    return "info";
  }
  return (LOG_LEVELS as readonly string[]).includes(value)
    ? (value as LogLevel)
    : fail("LOG_LEVEL", `must be one of ${LOG_LEVELS.join(", ")}`);
}

function parseDsn(value: string | undefined): string | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  return URL.canParse(value) ? value : fail("SENTRY_DSN", "must be a valid URL");
}

/** Entier de `MIN` à `MAX` jours ; le message ne cite que la variable, jamais la valeur lue. */
function parseRetentionDays(value: string | undefined): number {
  if (value === undefined || value === "") {
    return WEBHOOK_RETENTION_DAYS_DEFAULT;
  }
  const days = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  return days >= WEBHOOK_RETENTION_DAYS_MIN && days <= WEBHOOK_RETENTION_DAYS_MAX
    ? days
    : fail(
        "WEBHOOK_RETENTION_DAYS",
        `must be an integer between ${WEBHOOK_RETENTION_DAYS_MIN} and ${WEBHOOK_RETENTION_DAYS_MAX}`,
      );
}

const STRICT_ENVS = ["staging", "production"];

/** Domaine de l'adresse d'expéditeur (`Nom <a@b>` ou `a@b`), en minuscules. */
function domainOfSender(from: string): string {
  return from
    .slice(from.lastIndexOf("@") + 1)
    .replace(">", "")
    .trim()
    .toLowerCase();
}

/**
 * Sans clé : capture en development/test, échec en staging/production. Avec clé : domaine et
 * expéditeur requis, l'expéditeur appartenant au domaine. Les messages ne citent que le nom
 * de la variable, jamais sa valeur.
 */
function parseMail(env: Readonly<Record<string, string | undefined>>, appEnv: string): MailConfig {
  const apiKey = env.RESEND_API_KEY || undefined;
  if (apiKey === undefined && !STRICT_ENVS.includes(appEnv)) {
    return { kind: "capture" };
  }
  const domain = env.MAIL_DOMAIN || undefined;
  const from = env.EMAIL_FROM || undefined;
  if (apiKey === undefined) {
    return fail("RESEND_API_KEY", `is required when APP_ENV is ${appEnv}`);
  }
  if (domain === undefined) {
    return fail("MAIL_DOMAIN", "is required when RESEND_API_KEY is set");
  }
  if (from === undefined) {
    return fail("EMAIL_FROM", "is required when RESEND_API_KEY is set");
  }
  const sender = domainOfSender(from);
  if (sender !== domain.toLowerCase() && !sender.endsWith(`.${domain.toLowerCase()}`)) {
    return fail("EMAIL_FROM", "must belong to MAIL_DOMAIN");
  }
  return { kind: "resend", apiKey, domain, from };
}

/** Lit la configuration du worker depuis l'environnement ; échoue si elle est incomplète. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): WorkerConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const appEnv = env.APP_ENV || "development";
  const githubApp = githubAppFromEnv(env);
  return {
    databaseUrl,
    appEnv,
    appVersion: env.APP_VERSION || "dev",
    logLevel: parseLogLevel(env.LOG_LEVEL),
    sentryDsn: parseDsn(env.SENTRY_DSN),
    mail: parseMail(env, appEnv),
    ...(githubApp ? { githubApp } : {}),
    webhookRetentionDays: parseRetentionDays(env.WEBHOOK_RETENTION_DAYS),
  };
}
