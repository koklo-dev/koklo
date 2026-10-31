import {
  GitProviderError,
  type GitUserCredentials,
  type GitUserInstallation,
  InvalidUserCodeError,
  oauthErrorCodeOf,
} from "@koklo/domain";
import { WRITE } from "../client.ts";
import type { Gateway } from "../gateway.ts";
import { collectPages, PAGE_SIZE } from "../pagination.ts";
import type { Request } from "./shared.ts";

const GITHUB_OAUTH_URL = "https://github.com";
const EXCHANGE = "exchangeUserCode";
const LIST = "listUserInstallations";
const DEFAULT_TOKEN_TTL_SECONDS = 8 * 60 * 60;

type TokenResponse = {
  access_token?: string;
  error?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
};
type ApiInstallation = { id: number | string; account?: unknown };
type ApiAccount = { login?: unknown; type?: unknown };

/**
 * Échange le `code` du retour d'autorisation contre un jeton utilisateur (flux web de l'App).
 * GitHub répond 200 même quand le code est refusé : l'erreur est dans le corps. Jamais rejoué
 * (le code est à usage unique) ; ni le code ni le secret client ne sortent dans une erreur.
 */
export function exchangeUserCode(
  gw: Gateway,
  request: Request<"exchangeUserCode">,
): Promise<GitUserCredentials> {
  const { clientId, clientSecret } = gw;
  if (clientId === undefined || clientSecret === undefined) {
    return Promise.reject(
      new GitProviderError(EXCHANGE, "Identifiants client de l'App GitHub non configurés."),
    );
  }
  const operation = { operation: EXCHANGE, resource: "user token", identifier: "user" };
  return gw.anonymous(operation, { kind: "user", refreshable: false }, async (octokit) => {
    const response = await octokit.request("POST /login/oauth/access_token", {
      baseUrl: GITHUB_OAUTH_URL,
      client_id: clientId,
      client_secret: clientSecret,
      code: request.code,
      redirect_uri: request.redirectUri,
      headers: { accept: "application/json" },
      ...WRITE,
    });
    return fromGrant(response.data as TokenResponse, response.status, gw.now().getTime());
  });
}

function fromGrant(data: TokenResponse, status: number, now: number): GitUserCredentials {
  // Seul le code public de la liste blanche est gardé : ni `error_description`, ni le corps.
  const diagnostic = { operation: EXCHANGE, status, oauthError: oauthErrorCodeOf(data.error) };
  if (data.error === "bad_verification_code") throw new InvalidUserCodeError(diagnostic);
  if (data.error !== undefined || typeof data.access_token !== "string") {
    throw new GitProviderError(EXCHANGE, undefined, diagnostic);
  }
  const at = (seconds: number) => new Date(now + seconds * 1000).toISOString();
  return {
    token: data.access_token,
    // Un jeton sans expiration ne vient que d'une App qui ne l'a pas activée : on le traite comme valable 8 h.
    expiresAt: at(data.expires_in ?? DEFAULT_TOKEN_TTL_SECONDS),
    ...(data.refresh_token === undefined ? {} : { refreshToken: data.refresh_token }),
    ...(data.refresh_token_expires_in === undefined
      ? {}
      : { refreshExpiresAt: at(data.refresh_token_expires_in) }),
  };
}

/** Installations de l'App visibles du jeton utilisateur ; celles sans compte lisible sont ignorées. */
export function listUserInstallations(
  gw: Gateway,
  request: Request<"listUserInstallations">,
): Promise<readonly GitUserInstallation[]> {
  const { auth } = request;
  if (auth.kind !== "user") {
    return Promise.reject(
      new GitProviderError(LIST, "Un jeton utilisateur est requis pour lister les installations."),
    );
  }
  const operation = { operation: LIST, resource: "installations", identifier: "user" };
  return gw.withAuth(operation, auth, async (octokit) => {
    const pages = octokit.paginate.iterator(
      octokit.rest.apps.listInstallationsForAuthenticatedUser,
      {
        per_page: PAGE_SIZE,
      },
    );
    const raw = await collectPages<ApiInstallation>(pages, LIST, gw.maxPages);
    return raw.flatMap(toInstallation);
  });
}

function toInstallation(item: ApiInstallation): GitUserInstallation[] {
  const account = (item.account ?? {}) as ApiAccount;
  const login = account.login;
  if (typeof login !== "string" || login === "") return [];
  return [
    {
      externalId: String(item.id),
      ownerKind: account.type === "Organization" ? "organization" : "user",
      ownerLogin: login,
    },
  ];
}
