import {
  type GitAuth,
  GitAuthExpiredError,
  type GitOwner,
  GitProviderError,
  type GitUserCredentials,
  type GitUserInstallation,
  InvalidUserCodeError,
  type UserOwnerRole,
} from "@koklo/domain";

const HOUR_MS = 60 * 60 * 1000;
const USER_TOKEN_TTL_MS = 8 * HOUR_MS;
const REFRESH_TOKEN_TTL_MS = 180 * 24 * HOUR_MS;
const CODE_PREFIX = "fake-code-";

export type OrgMembership = "admin" | "member" | "pending";

/**
 * Flux d'autorisation du faux : le code `fake-code-<login>` (usage unique) donne un jeton lié au
 * compte `<login>`, qui ne voit que les installations injectées pour ce compte.
 */
export class FakeUserOAuth {
  readonly #now: () => Date;
  readonly #nextId: () => string;
  readonly #installations = new Map<string, GitUserInstallation[]>();
  readonly #loginOfToken = new Map<string, string>();
  readonly #memberships = new Map<string, OrgMembership>();
  readonly #usedCodes = new Set<string>();

  constructor(now: () => Date, nextId: () => string) {
    this.#now = now;
    this.#nextId = nextId;
  }

  seed(login: string, installation: GitUserInstallation): void {
    this.#installations.set(login, [...(this.#installations.get(login) ?? []), installation]);
  }

  /** Lien du compte `login` avec l'organisation `org` ; `pending` : invitation non acceptée. */
  seedMembership(login: string, org: string, role: OrgMembership): void {
    this.#memberships.set(`${login.toLowerCase()}/${org.toLowerCase()}`, role);
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
    const login = this.#loginOf("listUserInstallations", auth);
    return [...(this.#installations.get(login) ?? [])];
  }

  role(auth: GitAuth, owner: GitOwner): UserOwnerRole {
    const login = this.#loginOf("getUserOwnerRole", auth);
    if (owner.kind === "user")
      return login.toLowerCase() === owner.login.toLowerCase() ? "self" : "none";
    const membership = this.#memberships.get(`${login.toLowerCase()}/${owner.login.toLowerCase()}`);
    return membership === undefined || membership === "pending" ? "none" : membership;
  }

  #loginOf(operation: string, auth: GitAuth): string {
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
    return login;
  }
}
