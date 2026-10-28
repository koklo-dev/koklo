import { LOG_LEVELS, type LogLevel } from "@koklo/observability";

export type WorkerConfig = {
  readonly databaseUrl: string;
  readonly appEnv: string;
  readonly appVersion: string;
  readonly logLevel: LogLevel;
  /** DSN GlitchTip/Sentry ; absent : le SDK d'erreurs reste désactivé. */
  readonly sentryDsn: string | undefined;
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

/** Lit la configuration du worker depuis l'environnement ; échoue si elle est incomplète. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): WorkerConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  return {
    databaseUrl,
    appEnv: env.APP_ENV || "development",
    appVersion: env.APP_VERSION || "dev",
    logLevel: parseLogLevel(env.LOG_LEVEL),
    sentryDsn: parseDsn(env.SENTRY_DSN),
  };
}
