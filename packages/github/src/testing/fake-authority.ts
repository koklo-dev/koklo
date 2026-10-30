import { type GitAuth, GitAuthExpiredError, type GitUserCredentials } from "@koklo/domain";

const HOUR_MS = 60 * 60 * 1000;
const USER_TOKEN_TTL_MS = 8 * HOUR_MS;
const REFRESH_TOKEN_TTL_MS = 180 * 24 * HOUR_MS;

/** Jetons du faux : durées de vie, expiration (401) et rafraîchissement, comme chez GitHub. */
export class FakeAuthority {
  readonly #now: () => Date;
  readonly #nextId: () => string;

  constructor(now: () => Date, nextId: () => string) {
    this.#now = now;
    this.#nextId = nextId;
  }

  installation(): GitAuth {
    return {
      kind: "installation",
      token: `fake-installation-${this.#nextId()}`,
      expiresAt: new Date(this.#now().getTime() + HOUR_MS).toISOString(),
    };
  }

  /** Un jeton expiré est refusé par toute opération, comme chez GitHub (401). */
  assertFresh(operation: string, auth: GitAuth): void {
    if (Date.parse(auth.expiresAt) <= this.#now().getTime()) {
      throw new GitAuthExpiredError({
        operation,
        kind: auth.kind,
        refreshable: auth.kind === "user" && auth.refreshToken !== undefined,
      });
    }
  }

  user(user: GitUserCredentials): GitAuth {
    const now = this.#now().getTime();
    const refreshable =
      user.refreshToken !== undefined &&
      (user.refreshExpiresAt === undefined || Date.parse(user.refreshExpiresAt) > now);
    if (Date.parse(user.expiresAt) > now) return { kind: "user", ...user };
    if (!refreshable) {
      throw new GitAuthExpiredError({
        operation: "authenticate",
        kind: "user",
        refreshable: false,
      });
    }
    const id = this.#nextId();
    return {
      kind: "user",
      token: `fake-user-${id}`,
      expiresAt: new Date(now + USER_TOKEN_TTL_MS).toISOString(),
      refreshToken: `fake-refresh-${id}`,
      refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS).toISOString(),
    };
  }
}
