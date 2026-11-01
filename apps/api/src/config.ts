import { type GithubAppSettings, githubAppFromEnv } from "@koklo/github";
import { LOG_LEVELS, type LogLevel } from "@koklo/observability";
import { z } from "zod";
import type { AiLimits } from "./ai/ai-budget.ts";
import type { KeyRingSettings } from "./crypto/key-ring.ts";
import { keyRingFromEnv } from "./crypto/key-ring-config.ts";
import { InvalidEncryptionKeyError, parseEncryptionKey } from "./crypto/token-cipher.ts";

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
  githubApp?: GithubAppSettings;
  /** Clé AES-256 (32 octets) des jetons utilisateur (`KOKLO_ENCRYPTION_KEY`) ; absente : aucun jeton conservé. */
  encryptionKey?: Buffer;
  /** Porte-clés versionné (`KOKLO_ENCRYPTION_KEY[_VERSION]`, `KOKLO_ENCRYPTION_KEYS_PREVIOUS`) ; absent avec la clé. */
  encryptionKeyring?: KeyRingSettings;
  /** Secret de signature des webhooks GitHub (`GITHUB_WEBHOOK_SECRET`) ; absent : la route d'ingestion répond 503. */
  githubWebhookSecret?: string;
  /** Attente maximale de `specBatch.submit` avant de rendre le lot en cours (ms) ; défaut : `SPEC_BATCH_WAIT_DEFAULT_MS`. */
  specBatchWaitMs?: number;
  /** Plafonds des appels IA (`AI_MAX_*`, TK-54b) ; absents : `AI_LIMIT_DEFAULTS`. */
  ai?: Partial<AiLimits>;
}

const MIN_AUTH_SECRET_LENGTH = 32;
/** Borne haute de `SPEC_BATCH_WAIT_MS` : au-delà, une requête HTTP reste ouverte trop longtemps. */
const SPEC_BATCH_WAIT_MAX_MS = 60_000;

/** Plafond d'un réglage `AI_MAX_*` : au-delà, le plafond ne protège plus de rien. */
const AI_LIMIT_MAX = 100_000;
const aiLimit = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().int().min(1).max(AI_LIMIT_MAX).optional(),
);

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
  KOKLO_ENCRYPTION_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional(),
  ),
  KOKLO_ENCRYPTION_KEY_VERSION: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional(),
  ),
  KOKLO_ENCRYPTION_KEYS_PREVIOUS: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional(),
  ),
  GITHUB_WEBHOOK_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  SPEC_BATCH_WAIT_MS: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().min(1).max(SPEC_BATCH_WAIT_MAX_MS).optional(),
  ),
  AI_MAX_CALLS_PER_HOUR_ORG: aiLimit,
  AI_MAX_CALLS_PER_HOUR_USER: aiLimit,
  AI_MAX_VERIFY_PER_HOUR_ORG: aiLimit,
  AI_MAX_CONCURRENT_PER_ORG: aiLimit,
});

type EnvData = z.infer<typeof envSchema>;

/** Plafonds des appels IA réglés par l'environnement ; `undefined` si aucun n'est posé. */
function aiLimitsOf(data: EnvData): Partial<AiLimits> | undefined {
  const limits: Partial<AiLimits> = {
    ...(data.AI_MAX_CALLS_PER_HOUR_ORG === undefined
      ? {}
      : { maxCallsPerHourOrg: data.AI_MAX_CALLS_PER_HOUR_ORG }),
    ...(data.AI_MAX_CALLS_PER_HOUR_USER === undefined
      ? {}
      : { maxCallsPerHourUser: data.AI_MAX_CALLS_PER_HOUR_USER }),
    ...(data.AI_MAX_VERIFY_PER_HOUR_ORG === undefined
      ? {}
      : { maxVerifyPerHourOrg: data.AI_MAX_VERIFY_PER_HOUR_ORG }),
    ...(data.AI_MAX_CONCURRENT_PER_ORG === undefined
      ? {}
      : { maxConcurrentPerOrg: data.AI_MAX_CONCURRENT_PER_ORG }),
  };
  return Object.keys(limits).length === 0 ? undefined : limits;
}

/**
 * Clé de chiffrement des jetons utilisateur. Absente, elle n'est exigée que si l'App a ses
 * identifiants client : sans clé, un jeton obtenu ne pourrait pas être conservé. Le message ne
 * cite que le nom de la variable, jamais sa valeur.
 */
function encryptionKeyOf(value: string | undefined, githubApp: GithubAppSettings | undefined) {
  if (value === undefined) {
    if (githubApp?.clientId !== undefined) {
      throw new Error(
        "Configuration invalide (KOKLO_ENCRYPTION_KEY: requise avec GITHUB_APP_CLIENT_ID et GITHUB_APP_CLIENT_SECRET)",
      );
    }
    return undefined;
  }
  try {
    return parseEncryptionKey(value);
  } catch (error) {
    if (!(error instanceof InvalidEncryptionKeyError)) throw error;
    throw new Error(
      "Configuration invalide (KOKLO_ENCRYPTION_KEY: 32 octets en base64 attendus, ou 32 caractères alphanumériques)",
    );
  }
}

/**
 * Lit exactement les variables listées dans `.env.example` (un test garde les deux alignés).
 * Échoue au démarrage, avec le nom de la variable fautive, plutôt qu'au premier appel.
 * Le message ne cite que le nom de la variable et la règle violée, jamais la valeur reçue.
 */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  // Exactement les variables du schéma : aucune autre variable de l'environnement n'est lue.
  const picked = Object.fromEntries(Object.keys(envSchema.shape).map((name) => [name, env[name]]));
  const parsed = envSchema.safeParse(picked);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Configuration invalide (${problems})`);
  }
  const data = parsed.data;
  const githubApp = githubAppFromEnv(env);
  const encryptionKey = encryptionKeyOf(data.KOKLO_ENCRYPTION_KEY, githubApp);
  const encryptionKeyring = keyRingFromEnv(
    encryptionKey,
    data.KOKLO_ENCRYPTION_KEY_VERSION,
    data.KOKLO_ENCRYPTION_KEYS_PREVIOUS,
  );
  const ai = aiLimitsOf(data);
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
    ...(encryptionKey ? { encryptionKey } : {}),
    ...(encryptionKeyring ? { encryptionKeyring } : {}),
    ...(data.GITHUB_WEBHOOK_SECRET === undefined
      ? {}
      : { githubWebhookSecret: data.GITHUB_WEBHOOK_SECRET }),
    ...(data.SPEC_BATCH_WAIT_MS === undefined ? {} : { specBatchWaitMs: data.SPEC_BATCH_WAIT_MS }),
    ...(ai === undefined ? {} : { ai }),
  };
}
