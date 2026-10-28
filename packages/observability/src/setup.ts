import { createLogger, type LogDestination, type Logger, type LogLevel } from "./logger.ts";
import { initObservability, type ObservabilityOptions } from "./sentry.ts";

export interface SetupObservabilityOptions extends ObservabilityOptions {
  level: LogLevel;
  /** Défaut : stdout. */
  destination?: LogDestination | undefined;
}

/** Initialise le SDK d'erreurs (no-op sans DSN) et crée le logger JSON : point d'entrée commun api/worker. */
export function setupObservability({
  level,
  destination,
  ...sdk
}: SetupObservabilityOptions): Logger {
  initObservability(sdk);
  return createLogger(destination ? { level, destination } : { level });
}
