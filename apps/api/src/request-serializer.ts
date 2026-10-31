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

const REDACTED = "[Redacted]";
/** En-têtes dont la valeur ne doit jamais atteindre un journal (signature de webhook, TK-45). */
const SECRET_HEADERS = new Set(["x-hub-signature-256", "x-hub-signature"]);

function redactHeaders(headers: unknown): unknown {
  if (typeof headers !== "object" || headers === null) return headers;
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      SECRET_HEADERS.has(name.toLowerCase()) ? REDACTED : value,
    ]),
  );
}

/**
 * Sérialiseur `req` du journal de requêtes : mêmes champs que le standard, mais l'URL est réduite
 * à son chemin et `query` / `params` / `raw` sont écartés (jetons de lien magique, TK-22) ; la
 * signature d'un webhook (`x-hub-signature-256`) est masquée.
 */
export function serializeRequest(request: SerializedRequest): Record<string, unknown> {
  return {
    id: request.id,
    method: request.method,
    url: pathOnly(request.url),
    headers: redactHeaders(request.headers),
    remoteAddress: request.remoteAddress,
    remotePort: request.remotePort,
  };
}
