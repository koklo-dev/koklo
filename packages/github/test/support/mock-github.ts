import { generateKeyPairSync } from "node:crypto";
import type { GitAuth, GitOwner } from "@koklo/domain";
import { createOctokitGitProvider, type OctokitGitProviderOptions } from "../../src/index.ts";

/** Instant de l'horloge injectée dans l'adaptateur. */
export const NOW = "2026-10-30T12:00:00.000Z";
export const SENTINEL = "SECRET-SENTINEL-7f3a9c";

export const ORG: GitOwner = { kind: "organization", login: "acme" };
export const PERSON: GitOwner = { kind: "user", login: "octo" };

export const installationAuth = (token = "iat-fake"): GitAuth => ({
  kind: "installation",
  token,
  expiresAt: "2026-10-30T13:00:00.000Z",
});
export const userAuth = (token = "uat-fake", refreshToken?: string): GitAuth => ({
  kind: "user",
  token,
  expiresAt: "2026-10-30T20:00:00.000Z",
  ...(refreshToken === undefined ? {} : { refreshToken }),
});

/** Clé générée à l'exécution : aucun PEM n'est écrit dans le dépôt. */
export const TEST_PRIVATE_KEY = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
}).privateKey;

export type RecordedRequest = {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
};

export type MockReply = {
  readonly status?: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
};
export type MockRoute = MockReply | Error | ((request: RecordedRequest) => MockReply | Error);

/**
 * Transport HTTP simulé (aucune dépendance) : routes `"METHOD /chemin"`, requêtes enregistrées,
 * toute requête non routée répond 404 et est listée dans `unmatched`.
 */
export function createMockGitHub(routes: Readonly<Record<string, MockRoute>> = {}) {
  const requests: RecordedRequest[] = [];
  const unmatched: string[] = [];
  const table = new Map(Object.entries(routes));

  const fetchMock = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const recorded = record(input, init);
    requests.push(recorded);
    const key = `${recorded.method} ${recorded.path}`;
    const route = table.get(key);
    if (route === undefined) {
      unmatched.push(key);
      return json(404, { message: "Not Found" }, {});
    }
    const reply = typeof route === "function" ? route(recorded) : route;
    if (reply instanceof Error) throw reply;
    return withUrl(json(reply.status ?? 200, reply.body ?? {}, reply.headers ?? {}), input);
  };

  return {
    fetch: fetchMock as typeof fetch,
    requests,
    unmatched,
    route: (key: string, route: MockRoute) => void table.set(key, route),
    /** Requêtes d'écriture (tout sauf GET). */
    writes: () => requests.filter((r) => r.method !== "GET"),
    count: (key: string) => requests.filter((r) => `${r.method} ${r.path}` === key).length,
  };
}

const lowerHeaders = (headers: RequestInit["headers"]): Record<string, string> =>
  Object.fromEntries(
    Object.entries((headers ?? {}) as Record<string, string>).map(([k, v]) => [
      k.toLowerCase(),
      String(v),
    ]),
  );

const record = (input: string | URL | Request, init?: RequestInit): RecordedRequest => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  return {
    method: (init?.method ?? "GET").toUpperCase(),
    path: url.pathname,
    query: url.searchParams,
    headers: lowerHeaders(init?.headers),
    body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
  };
};

const json = (status: number, body: unknown, headers: Readonly<Record<string, string>>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

/**
 * Un `Response` construit à la main a une `url` vide, alors que `fetch` la renseigne toujours :
 * `plugin-paginate-rest` relit `response.url` pour les listes à espace de noms (check-runs).
 */
const withUrl = (response: Response, input: string | URL | Request): Response =>
  Object.defineProperty(response, "url", {
    value: input instanceof Request ? input.url : String(input),
  });

export type MockGitHub = ReturnType<typeof createMockGitHub>;

/** Adaptateur branché sur le transport simulé ; pas de retry, d'attente ni d'espacement des écritures par défaut. */
export function providerOn(mock: MockGitHub, overrides: Partial<OctokitGitProviderOptions> = {}) {
  return createOctokitGitProvider({
    appId: "123456",
    privateKey: TEST_PRIVATE_KEY,
    clientId: "Iv1.fake-client",
    clientSecret: "client-secret-fake",
    now: () => new Date(NOW),
    fetch: mock.fetch,
    retries: 0,
    spaceWrites: false,
    ...overrides,
  });
}

/** Récupère l'erreur levée par une promesse (échoue si elle se résout). */
export async function caught(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error(`valeur levée non-Error : ${String(error)}`);
  }
  throw new Error("la promesse s'est résolue alors qu'une erreur était attendue");
}

export const repoRef = { owner: ORG, name: "demo" } as const;
export const prRef = { repo: repoRef, number: 7 } as const;
