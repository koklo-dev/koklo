import * as Sentry from "@sentry/node";

export interface ObservabilityOptions {
  /** Absent ou vide : le SDK n'est pas initialisé (no-op). */
  dsn?: string | undefined;
  environment: string;
  release: string;
}

/** Initialise le SDK compatible Sentry (GlitchTip) seulement si un DSN est fourni. */
export function initObservability({ dsn, environment, release }: ObservabilityOptions): boolean {
  if (!dsn) {
    return false;
  }
  Sentry.init({ dsn, environment, release });
  return true;
}

/** Transmet l'erreur au SDK ; une panne du SDK ne doit jamais changer le comportement appelant. */
export function captureError(error: unknown, context?: Record<string, string>): void {
  try {
    Sentry.captureException(error, { tags: context });
  } catch {
    // Le signalement est un effet de bord : on l'abandonne en silence.
  }
}
