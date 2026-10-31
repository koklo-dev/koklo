import { GitProviderError } from "@koklo/domain";
import type { Gateway } from "../gateway.ts";
import type { Authenticator } from "./authentication.ts";

const OPERATION = "appSlug";

/**
 * Identifiant d'URL de l'App, lu par `GET /app` (JWT d'App) puis gardé pour la durée de vie du
 * processus : il ne change pas. Un échec n'est pas mis en cache.
 */
export class AppSlug {
  readonly #gateway: Gateway;
  readonly #authenticator: Authenticator;
  #slug: string | undefined;

  constructor(gateway: Gateway, authenticator: Authenticator) {
    this.#gateway = gateway;
    this.#authenticator = authenticator;
  }

  async read(): Promise<string> {
    this.#slug ??= await this.#fetch();
    return this.#slug;
  }

  #fetch(): Promise<string> {
    const operation = { operation: OPERATION, resource: "app", identifier: "app" };
    return this.#gateway.anonymous(
      operation,
      { kind: "installation", refreshable: false },
      async (octokit) => {
        const jwt = await this.#authenticator.appJwt(octokit);
        const response = await octokit.request("GET /app", {
          headers: { authorization: `bearer ${jwt}` },
        });
        const slug = (response.data as { slug?: unknown }).slug;
        if (typeof slug !== "string" || slug === "") throw new GitProviderError(OPERATION);
        return slug;
      },
    );
  }
}
