import {
  type GitAuth,
  GitAuthExpiredError,
  GitNotFoundError,
  type GitOwner,
  type GitUserCredentials,
  UserTokenRequiredError,
} from "@koklo/domain";
import { createAppAuth } from "@octokit/auth-app";
import { type GitHubOctokit, WRITE } from "../client.ts";
import { statusOf } from "../errors-map.ts";
import type { Gateway } from "../gateway.ts";

const OPERATION = "authenticate";
/** Sous ce délai restant, un jeton d'installation en cache est renouvelé avant d'être rendu. */
const MIN_INSTALLATION_TTL_MS = 5 * 60 * 1000;
const GITHUB_OAUTH_URL = "https://github.com";

type AppAuth = ReturnType<typeof createAppAuth>;
type RefreshResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
};

type InstallationRequest = { id: string; owner: GitOwner };
type ClientCredentials = { clientId: string; clientSecret: string };

/**
 * `authenticate` : jeton d'installation (JWT de l'App via `@octokit/auth-app`, avec son cache)
 * ou jeton utilisateur validé auprès de GitHub puis rafraîchi s'il est expiré. L'appelant doit
 * persister le `GitAuth` rendu après un rafraîchissement (le refresh token change).
 */
export class Authenticator {
  readonly #gateway: Gateway;
  readonly #app: { appId: string; privateKey: string };
  #appAuth: AppAuth | undefined;

  constructor(gateway: Gateway, app: { appId: string; privateKey: string }) {
    this.#gateway = gateway;
    this.#app = app;
  }

  authenticate(request: {
    installation: InstallationRequest;
    user?: GitUserCredentials;
  }): Promise<GitAuth> {
    return request.user === undefined
      ? this.#installation(request.installation)
      : this.#user(request.user, request.installation);
  }

  #installation(installation: InstallationRequest): Promise<GitAuth> {
    const operation = {
      operation: OPERATION,
      resource: "installation",
      identifier: installation.id,
    };
    const installationId = Number(installation.id);
    if (!Number.isSafeInteger(installationId) || installationId <= 0) {
      return Promise.reject(new GitNotFoundError(operation));
    }
    return this.#gateway.anonymous(
      operation,
      { kind: "installation", refreshable: false },
      async (octokit) => {
        const auth = this.#appAuthFor(octokit);
        let token = await auth({ type: "installation", installationId });
        if (Date.parse(token.expiresAt) - this.#gateway.now().getTime() < MIN_INSTALLATION_TTL_MS) {
          token = await auth({ type: "installation", installationId, refresh: true });
        }
        return {
          kind: "installation",
          token: token.token,
          expiresAt: new Date(token.expiresAt).toISOString(),
        };
      },
    );
  }

  /** JWT de l'App (10 minutes) pour les routes réservées à l'App, comme `GET /app`. */
  async appJwt(octokit: GitHubOctokit): Promise<string> {
    return (await this.#appAuthFor(octokit)({ type: "app" })).token;
  }

  #appAuthFor(octokit: GitHubOctokit): AppAuth {
    this.#appAuth ??= createAppAuth({ ...this.#app, request: octokit.request });
    return this.#appAuth;
  }

  async #user(
    credentials: GitUserCredentials,
    installation: InstallationRequest,
  ): Promise<GitAuth> {
    const client = this.#client();
    if (client === undefined) {
      // Sans identifiants client, un jeton utilisateur ne peut être ni validé ni rafraîchi.
      throw new UserTokenRequiredError({ operation: OPERATION, owner: installation.owner });
    }
    const expired = Date.parse(credentials.expiresAt) <= this.#gateway.now().getTime();
    if (!expired) {
      await this.#validate(credentials, client);
      return { kind: "user", ...credentials };
    }
    return this.#refresh(credentials, client);
  }

  #client(): ClientCredentials | undefined {
    const { clientId, clientSecret } = this.#gateway;
    return clientId === undefined || clientSecret === undefined
      ? undefined
      : { clientId, clientSecret };
  }

  /** « Check a token » : exige le secret client, donc prouve que le jeton vient de notre App. */
  #validate(credentials: GitUserCredentials, client: ClientCredentials): Promise<void> {
    const { clientId, clientSecret } = client;
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    return this.#gateway.anonymous(
      userOperation(),
      userCredential(credentials),
      async (octokit) => {
        try {
          await octokit.request("POST /applications/{client_id}/token", {
            client_id: clientId,
            access_token: credentials.token,
            headers: { authorization: `basic ${basic}` },
            ...WRITE,
          });
        } catch (error) {
          if (statusOf(error) === 404 || statusOf(error) === 422) throw expiredUserToken(false);
          throw error;
        }
      },
    );
  }

  #refresh(credentials: GitUserCredentials, client: ClientCredentials): Promise<GitAuth> {
    const now = this.#gateway.now().getTime();
    const { refreshToken, refreshExpiresAt } = credentials;
    const refreshable =
      refreshToken !== undefined &&
      (refreshExpiresAt === undefined || Date.parse(refreshExpiresAt) > now);
    if (!refreshable) return Promise.reject(expiredUserToken(false));
    const { clientId, clientSecret } = client;
    return this.#gateway.anonymous(
      userOperation(),
      userCredential(credentials),
      async (octokit) => {
        const response = await octokit.request("POST /login/oauth/access_token", {
          baseUrl: GITHUB_OAUTH_URL,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          headers: { accept: "application/json" },
          ...WRITE,
        });
        return fromRefresh(response.data as RefreshResponse, now);
      },
    );
  }
}

const userOperation = () => ({
  operation: OPERATION,
  resource: "user token",
  identifier: "user",
});

const userCredential = (credentials: GitUserCredentials) =>
  ({ kind: "user", refreshable: credentials.refreshToken !== undefined }) as const;

const expiredUserToken = (refreshable: boolean) =>
  new GitAuthExpiredError({ operation: OPERATION, kind: "user", refreshable });

/** GitHub répond 200 même pour un refresh token invalide : l'absence de jeton est l'échec. */
function fromRefresh(data: RefreshResponse, now: number): GitAuth {
  if (data.access_token === undefined || data.expires_in === undefined) {
    throw expiredUserToken(false);
  }
  const at = (seconds: number) => new Date(now + seconds * 1000).toISOString();
  return {
    kind: "user",
    token: data.access_token,
    expiresAt: at(data.expires_in),
    ...(data.refresh_token === undefined ? {} : { refreshToken: data.refresh_token }),
    ...(data.refresh_token_expires_in === undefined
      ? {}
      : { refreshExpiresAt: at(data.refresh_token_expires_in) }),
  };
}
