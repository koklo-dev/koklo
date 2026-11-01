/**
 * Garde-fou de démarrage : `APP_ENV=test` active la session de test (`x-test-session`, rôle fourni
 * par l'en-tête) ; une API lancée en `NODE_ENV=production` refuse de démarrer avec ce réglage.
 * Le message ne cite que les noms des variables, jamais une valeur.
 */
export function assertSafeEnvironment(env: Record<string, string | undefined>): void {
  if (env.NODE_ENV === "production" && env.APP_ENV === "test") {
    throw new Error(
      "Démarrage refusé : APP_ENV=test (session de test) est interdit quand NODE_ENV=production",
    );
  }
}
