/**
 * Garde-fou : le jeu de démo ne doit jamais atteindre la production. Vérifié avant toute
 * connexion, sans échappatoire. Limite assumée : il repose sur `NODE_ENV`, pas sur l'URL.
 */
export function assertSeedAllowed(env: { NODE_ENV?: string }): void {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Seed refusé : NODE_ENV=production. Le jeu de démo ne se charge jamais en production.",
    );
  }
}
