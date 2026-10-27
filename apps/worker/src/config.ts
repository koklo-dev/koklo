export type WorkerConfig = { readonly databaseUrl: string };

/** Lit la configuration du worker depuis l'environnement ; échoue si elle est incomplète. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): WorkerConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  return { databaseUrl };
}
