const normalized = (value: string | undefined): string => (value ?? "").trim().toLowerCase();

/**
 * Garde-fou de démarrage : `APP_ENV=test` active la session de test (`x-test-session`, rôle fourni
 * par l'en-tête) ; une API lancée en `NODE_ENV=production` refuse de démarrer avec ce réglage.
 * Les deux valeurs sont comparées après `trim` et mise en minuscules (`Production`, `"production "`
 * ne contournent plus le refus). `NODE_ENV` absent n'est PAS refusé (e2e et développement : voir
 * docs/quality-and-operations.md). Le message ne cite que les noms des variables, jamais une valeur.
 */
export function assertSafeEnvironment(env: Record<string, string | undefined>): void {
  if (normalized(env.NODE_ENV) === "production" && normalized(env.APP_ENV) === "test") {
    throw new Error(
      "Démarrage refusé : APP_ENV=test (session de test) est interdit quand NODE_ENV=production",
    );
  }
}
