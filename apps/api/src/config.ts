import { z } from "zod";

export interface AppConfig {
  databaseUrl: string;
  port: number;
  appEnv: "development" | "test" | "production";
  appVersion: string;
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_VERSION: z.string().min(1).default("dev"),
});

/**
 * Lit exactement les variables listées dans `.env.example` (un test garde les deux alignés).
 * Échoue au démarrage, avec le nom de la variable fautive, plutôt qu'au premier appel.
 */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = envSchema.safeParse({
    DATABASE_URL: env.DATABASE_URL,
    PORT: env.PORT,
    APP_ENV: env.APP_ENV,
    APP_VERSION: env.APP_VERSION,
  });
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Configuration invalide (${problems})`);
  }
  const { DATABASE_URL, PORT, APP_ENV, APP_VERSION } = parsed.data;
  return { databaseUrl: DATABASE_URL, port: PORT, appEnv: APP_ENV, appVersion: APP_VERSION };
}
