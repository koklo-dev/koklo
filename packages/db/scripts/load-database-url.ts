/** URL de la base pour les scripts de seed : `.env` du paquet, sinon l'environnement. */
export function loadDatabaseUrl(): string {
  try {
    process.loadEnvFile();
  } catch {
    // pas de .env : la variable peut venir de l'environnement
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL n'est pas défini (voir packages/db/.env.example)");
  }
  return url;
}
