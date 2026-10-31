import {
  type GitAuth,
  GitAuthExpiredError,
  GitProviderError,
  type GitUserCredentials,
  type GitUserInstallation,
  InvalidUserCodeError,
} from "@koklo/domain";

const HOUR_MS = 60 * 60 * 1000;
const USER_TOKEN_TTL_MS = 8 * HOUR_MS;
const REFRESH_TOKEN_TTL_MS = 180 * 24 * HOUR_MS;
const CODE_PREFIX = "fake-code-";

/**
 * Flux d'autorisation du faux : le code `fake-code-<login>` (usage unique) donne un jeton lié au
 * compte `<login>`, qui ne voit que les installations injectées pour ce compte.
 */
export class FakeUserOAuth {
  readonly #now: () => Date;
  readonly #nextId: () => string;
  readonly #installations = new Map<string, GitUserInstallation[]>();
  readonly #loginOfToken = new Map<string, string>();
  readonly #usedCodes = new Set<string>();

  constructor(now: () => Date, nextId: () => string) {
    this.#now = now;
    this.#nextId = nextId;
  }

  seed(login: string, installation: GitUserInstallation): void {
    this.#installations.set(login, [...(this.#installations.get(login) ?? []), installation]);
  }

  exchange(request: { code: string; redirectUri: string }): GitUserCredentials {
    const login = request.code.startsWith(CODE_PREFIX)
      ? request.code.slice(CODE_PREFIX.length)
      : "";
    if (login === "" || request.redirectUri === "" || this.#usedCodes.has(request.code)) {
      throw new InvalidUserCodeError({ operation: "exchangeUserCode" });
    }
    this.#usedCodes.add(request.code);
    const id = this.#nextId();
    const token = `fake-user-${id}`;
    this.#loginOfToken.set(token, login);
    const now = this.#now().getTime();
    return {
      token,
      expiresAt: new Date(now + USER_TOKEN_TTL_MS).toISOString(),
      refreshToken: `fake-refresh-${id}`,
      refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS).toISOString(),
    };
  }

  list(auth: GitAuth): readonly GitUserInstallation[] {
    const operation = "listUserInstallations";
    if (auth.kind !== "user") {
      throw new GitProviderError(operation, "Un jeton utilisateur est requis.");
    }
    const login = this.#loginOfToken.get(auth.token);
    if (Date.parse(auth.expiresAt) <= this.#now().getTime() || login === undefined) {
      throw new GitAuthExpiredError({
        operation,
        kind: "user",
        refreshable: auth.refreshToken !== undefined,
      });
    }
    return [...(this.#installations.get(login) ?? [])];
  }
}
