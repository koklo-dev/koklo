import { z } from "zod";

const runtimeEnvSchema = z.object({
  API_URL: z.url(),
  APP_ENV: z.string().min(1),
  APP_VERSION: z.string().min(1),
});

export interface RuntimeConfig {
  /** URL interne de l'API, jamais exposée au navigateur. */
  apiUrl: string;
  appEnv: string;
  appVersion: string;
}

/**
 * Lit la configuration à l'exécution (côté serveur uniquement). Aucune variable publique n'est
 * incorporée au build : changer `API_URL` puis redémarrer suffit. Les messages d'erreur ne
 * nomment que les variables fautives, jamais leur valeur.
 */
export function readRuntimeConfig(env: Record<string, string | undefined>): RuntimeConfig {
  const parsed = runtimeEnvSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Configuration d'exécution invalide : ${names.join(", ")}`);
  }
  const { API_URL, APP_ENV, APP_VERSION } = parsed.data;
  return { apiUrl: API_URL, appEnv: APP_ENV, appVersion: APP_VERSION };
}
