import { createLogger, type Logger } from "@koklo/observability";

/**
 * Logger de `guard`, qui s'exécute hors injection de dépendances. Seul `AppModule.forRoot` le
 * remplace (niveau, flux) ; tant qu'il ne l'a pas fait, un logger JSON au niveau info sert de
 * repli, jamais d'état indéfini. Un seul logger actif par processus.
 */
let current: Logger = createLogger({ level: "info" });

export function requestLogger(): Logger {
  return current;
}

export function useRequestLogger(next: Logger): void {
  current = next;
}
