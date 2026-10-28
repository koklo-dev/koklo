/** Champs de requête que `pino-http` fournit au sérialiseur (`pino-std-serializers`). */
interface SerializedRequest {
  id?: unknown;
  method?: unknown;
  url?: unknown;
  headers?: unknown;
  remoteAddress?: unknown;
  remotePort?: unknown;
}

/** Chemin sans query ni fragment : `/magic-link/verify?token=…` ne doit pas atteindre un journal. */
export function pathOnly(url: unknown): unknown {
  return typeof url === "string" ? (url.split(/[?#]/, 1)[0] ?? "") : url;
}

/**
 * Sérialiseur `req` du journal de requêtes : mêmes champs que le standard, mais l'URL est réduite
 * à son chemin et `query` / `params` / `raw` sont écartés (jetons de lien magique, TK-22).
 */
export function serializeRequest(request: SerializedRequest): Record<string, unknown> {
  return {
    id: request.id,
    method: request.method,
    url: pathOnly(request.url),
    headers: request.headers,
    remoteAddress: request.remoteAddress,
    remotePort: request.remotePort,
  };
}
