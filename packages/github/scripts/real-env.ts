/**
 * Variables d'environnement des tests réels (`pnpm --filter @koklo/github test:real`).
 * Préfixe `KOKLO_GH_` : GitHub refuse les secrets commençant par `GITHUB_`.
 */
export const REAL_ENV_VARIABLES = Object.freeze([
  "KOKLO_GH_APP_ID",
  "KOKLO_GH_PRIVATE_KEY",
  "KOKLO_GH_CLIENT_ID",
  "KOKLO_GH_CLIENT_SECRET",
  "KOKLO_GH_ORG_LOGIN",
  "KOKLO_GH_ORG_INSTALLATION_ID",
  "KOKLO_GH_USER_LOGIN",
  "KOKLO_GH_USER_INSTALLATION_ID",
  "KOKLO_GH_USER_TOKEN",
  "KOKLO_GH_USER_TOKEN_EXPIRES_AT",
] as const);

const PRIVATE_KEY = "KOKLO_GH_PRIVATE_KEY";
const PRIVATE_KEY_PATH = "KOKLO_GH_PRIVATE_KEY_PATH";

const isSet = (env: Readonly<Record<string, string | undefined>>, name: string): boolean =>
  (env[name] ?? "").trim() !== "";

/**
 * Variables obligatoires absentes ou vides. La clé privée peut venir de
 * `KOKLO_GH_PRIVATE_KEY_PATH` à la place de `KOKLO_GH_PRIVATE_KEY`.
 */
export function missingRealEnv(env: Readonly<Record<string, string | undefined>>): string[] {
  return REAL_ENV_VARIABLES.flatMap((name) => {
    if (isSet(env, name)) return [];
    if (name === PRIVATE_KEY) {
      return isSet(env, PRIVATE_KEY_PATH) ? [] : [`${PRIVATE_KEY} (ou ${PRIVATE_KEY_PATH})`];
    }
    return [name];
  });
}
