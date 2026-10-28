import { type Logger, pino } from "pino";

export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Destination minimale acceptée par pino : tout objet qui sait écrire une ligne. */
export interface LogDestination {
  write(line: string): void;
}

export interface LoggerOptions {
  level: LogLevel;
  /** Défaut : stdout. */
  destination?: LogDestination;
}

/**
 * Secrets qui ne doivent jamais atteindre un journal, quel que soit l'endroit où ils apparaissent :
 * en-têtes d'authentification (dont `set-cookie` des réponses : jeton de session), et `token` /
 * `url` (jeton et lien magique d'un payload de job).
 */
const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
  "authorization",
  "cookie",
  'res.headers["set-cookie"]',
  'headers["set-cookie"]',
  "token",
  "url",
  "data.token",
  "data.url",
  "job.data.token",
  "job.data.url",
];

/** Logger pino : une ligne JSON par événement, secrets d'en-tête masqués. */
export function createLogger({ level, destination }: LoggerOptions): Logger {
  return pino({ level, redact: { paths: REDACTED_PATHS, censor: "[Redacted]" } }, destination);
}

export type { Logger };
