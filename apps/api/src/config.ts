import { LOG_LEVELS, type LogLevel } from "@koklo/observability";
import { z } from "zod";

/**
 * GitHub App de l'épique (fournisseur git) : distincte de l'OAuth App de Better Auth (autres
 * identifiants, jamais lus ici). `clientId` et `clientSecret` vont ensemble et sont facultatifs :
 * ils ne servent qu'aux jetons utilisateur, flux non implémenté aujourd'hui.
 */
export interface GithubAppConfig {
  appId: string;
  privateKey: string;
  clientId?: string;
  clientSecret?: string;
}

export interface AppConfig {
  databaseUrl: string;
  port: number;
  appEnv: "development" | "test" | "staging" | "production";
  appVersion: string;
  betterAuthSecret: string;
  betterAuthUrl: string;
  githubClientId: string;
  githubClientSecret: string;
  logLevel: LogLevel;
  /** DSN GlitchTip/Sentry ; absent : le SDK d'erreurs reste désactivé. */
  sentryDsn: string | undefined;
  /** Absent : fournisseur git non configuré (staging sans App) ; voir `GITHUB_APP_*`. */
  githubApp?: GithubAppConfig;
}

const MIN_AUTH_SECRET_LENGTH = 32;

/** Paires de l'App GitHub, chacune tout-ou-rien (valeur vide = non fournie). */
const APP_IDENTITY = ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY"] as const;
const APP_CLIENT = ["GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET"] as const;

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  APP_VERSION: z.string().min(1).default("dev"),
  BETTER_AUTH_SECRET: z.string().min(MIN_AUTH_SECRET_LENGTH),
  BETTER_AUTH_URL: z.url(),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  SENTRY_DSN: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
});

/**
 * Clé PEM telle que l'infra la fournit : une ligne en base64 (`GH_APP_PRIVATE_KEY`, voir
 * docs/quality-and-operations.md), ou un PEM dont les retours à la ligne sont des `\n` littéraux.
 */
function pemOf(value: string): string {
  if (value.includes("-----BEGIN")) {
    return value.replaceAll("\\n", "\n");
  }
  const decoded = Buffer.from(value, "base64").toString("utf8");
  return decoded.includes("-----BEGIN") ? decoded : value;
}

type Env = Record<string, string | undefined>;

/**
 * Lit une paire tout-ou-rien : `undefined` si aucune variable n'est renseignée, les deux valeurs
 * si elles le sont ; une seule renseignée = erreur qui nomme l'autre (jamais une valeur reçue).
 */
function pairOf(
  env: Env,
  names: readonly [string, string],
  role: string,
): [string, string] | undefined {
  const given = names.filter((name) => (env[name] ?? "") !== "");
  if (given.length === 0) {
    return undefined;
  }
  const missing = names.filter((name) => !given.includes(name));
  if (missing.length > 0) {
    throw new Error(
      `Configuration invalide (GitHub App : ${missing.join(", ")} manquante(s) ; ${role})`,
    );
  }
  return [env[names[0]] as string, env[names[1]] as string];
}

/**
 * ID + clé privée forment la paire obligatoire de l'App (aucune = pas d'App) ; les identifiants
 * client forment une seconde paire facultative. Un client fourni sans App échoue en nommant l'ID.
 */
function githubAppOf(env: Env): GithubAppConfig | undefined {
  const identity = pairOf(env, APP_IDENTITY, "fournir les deux variables ou aucune");
  if (!identity) {
    if (APP_CLIENT.some((name) => (env[name] ?? "") !== "")) {
      throw new Error(
        "Configuration invalide (GitHub App : GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY manquante(s) ; les identifiants client exigent l'App)",
      );
    }
    return undefined;
  }
  const client = pairOf(env, APP_CLIENT, "fournir les deux variables ou aucune");
  return {
    appId: identity[0],
    privateKey: pemOf(identity[1]),
    ...(client ? { clientId: client[0], clientSecret: client[1] } : {}),
  };
}

/**
 * Lit exactement les variables listées dans `.env.example` (un test garde les deux alignés).
 * Échoue au démarrage, avec le nom de la variable fautive, plutôt qu'au premier appel.
 * Le message ne cite que le nom de la variable et la règle violée, jamais la valeur reçue.
 */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = envSchema.safeParse({
    DATABASE_URL: env.DATABASE_URL,
    PORT: env.PORT,
    APP_ENV: env.APP_ENV,
    APP_VERSION: env.APP_VERSION,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: env.GITHUB_CLIENT_SECRET,
    LOG_LEVEL: env.LOG_LEVEL,
    SENTRY_DSN: env.SENTRY_DSN,
  });
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Configuration invalide (${problems})`);
  }
  const data = parsed.data;
  const githubApp = githubAppOf(env);
  return {
    databaseUrl: data.DATABASE_URL,
    port: data.PORT,
    appEnv: data.APP_ENV,
    appVersion: data.APP_VERSION,
    betterAuthSecret: data.BETTER_AUTH_SECRET,
    betterAuthUrl: data.BETTER_AUTH_URL,
    githubClientId: data.GITHUB_CLIENT_ID,
    githubClientSecret: data.GITHUB_CLIENT_SECRET,
    logLevel: data.LOG_LEVEL,
    sentryDsn: data.SENTRY_DSN,
    ...(githubApp ? { githubApp } : {}),
  };
}
