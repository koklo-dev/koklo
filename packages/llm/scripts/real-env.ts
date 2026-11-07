import { LLM_PROVIDER_IDS, type LlmProviderId } from "@koklo/domain";

/** Variables lues par `test:real` : lancé à la main, jamais en CI, jamais avec une clé du dépôt. */
export const REAL_ENV = {
  provider: "KOKLO_LLM_REAL_PROVIDER",
  key: "KOKLO_LLM_REAL_KEY",
  model: "KOKLO_LLM_REAL_MODEL",
  baseUrl: "KOKLO_LLM_REAL_BASE_URL",
} as const;

export interface RealConfig {
  readonly provider: LlmProviderId;
  readonly key: string;
  readonly model: string;
  readonly baseUrl?: string;
}

/** Noms des variables manquantes ou invalides (liste vide = lancement autorisé). */
export const missingRealEnv = (env: Readonly<Record<string, string | undefined>>): string[] => {
  const problems: string[] = [];
  const provider = env[REAL_ENV.provider];
  if (!(LLM_PROVIDER_IDS as readonly string[]).includes(provider ?? "")) {
    problems.push(`${REAL_ENV.provider} (${LLM_PROVIDER_IDS.join(" | ")})`);
  }
  for (const name of [REAL_ENV.key, REAL_ENV.model]) {
    if (!env[name]) problems.push(name);
  }
  if (provider === "openai_compatible" && !env[REAL_ENV.baseUrl]) {
    problems.push(REAL_ENV.baseUrl);
  }
  return problems;
};

export const realConfigOf = (env: Readonly<Record<string, string | undefined>>): RealConfig => ({
  provider: env[REAL_ENV.provider] as LlmProviderId,
  key: env[REAL_ENV.key] as string,
  model: env[REAL_ENV.model] as string,
  ...(env[REAL_ENV.baseUrl] ? { baseUrl: env[REAL_ENV.baseUrl] as string } : {}),
});
