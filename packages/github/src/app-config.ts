/**
 * GitHub App de l'épique (fournisseur git), lue de l'environnement par l'API et par le worker avec
 * les mêmes règles. Distincte de l'OAuth App de Better Auth (autres identifiants, jamais lus ici).
 * `clientId` et `clientSecret` vont ensemble et sont facultatifs : ils ne servent qu'aux jetons
 * utilisateur, flux non implémenté aujourd'hui.
 */
export interface GithubAppSettings {
  appId: string;
  privateKey: string;
  clientId?: string;
  clientSecret?: string;
}

type Env = Readonly<Record<string, string | undefined>>;

/** Paires de l'App GitHub, chacune tout-ou-rien (valeur vide = non fournie). */
const APP_IDENTITY = ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY"] as const;
const APP_CLIENT = ["GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET"] as const;
const PAIR_RULE = "fournir les deux variables ou aucune";

/**
 * Clé PEM telle que l'infra la fournit : une ligne en base64 (`GH_APP_PRIVATE_KEY`, voir
 * docs/quality-and-operations.md), ou un PEM dont les retours à la ligne sont des `\n` littéraux.
 */
function pemOf(value: string): string {
  if (value.includes("-----BEGIN")) {
    return value.replaceAll("\\n", "\n");
  }
  const decoded = Buffer.from(value, "base64").toString("utf8");
  return decoded.includes("-----BEGIN") ? decoded : value;
}

/**
 * Lit une paire tout-ou-rien : `undefined` si aucune variable n'est renseignée, les deux valeurs
 * si elles le sont ; une seule renseignée = erreur qui nomme l'autre (jamais une valeur reçue).
 */
function pairOf(
  env: Env,
  names: readonly [string, string],
  role: string,
): [string, string] | undefined {
  const given = names.filter((name) => (env[name] ?? "") !== "");
  if (given.length === 0) {
    return undefined;
  }
  const missing = names.filter((name) => !given.includes(name));
  if (missing.length > 0) {
    throw new Error(
      `Configuration invalide (GitHub App : ${missing.join(", ")} manquante(s) ; ${role})`,
    );
  }
  return [env[names[0]] as string, env[names[1]] as string];
}

/**
 * ID + clé privée forment la paire obligatoire de l'App (aucune = pas d'App) ; les identifiants
 * client forment une seconde paire facultative. Un client fourni sans App échoue en nommant l'ID.
 */
export function githubAppFromEnv(env: Env): GithubAppSettings | undefined {
  const identity = pairOf(env, APP_IDENTITY, PAIR_RULE);
  if (!identity) {
    if (APP_CLIENT.some((name) => (env[name] ?? "") !== "")) {
      throw new Error(
        "Configuration invalide (GitHub App : GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY manquante(s) ; les identifiants client exigent l'App)",
      );
    }
    return undefined;
  }
  const client = pairOf(env, APP_CLIENT, PAIR_RULE);
  return {
    appId: identity[0],
    privateKey: pemOf(identity[1]),
    ...(client ? { clientId: client[0], clientSecret: client[1] } : {}),
  };
}
