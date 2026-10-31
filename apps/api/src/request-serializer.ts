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
const RESPONSE_SECRET_HEADERS: ReadonlySet<string> = new Set(["location"]);
/** En-têtes dont la valeur ne doit jamais atteindre un journal (signature de webhook, TK-45). */
const SECRET_HEADERS = new Set(["x-hub-signature-256", "x-hub-signature"]);

function redactHeaders(headers: unknown, names: ReadonlySet<string> = SECRET_HEADERS): unknown {
  if (typeof headers !== "object" || headers === null) return headers;
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      names.has(name.toLowerCase()) ? REDACTED : value,
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

/** Réponse du journal : `Location` écarté (une redirection peut porter un état, un jeton ou un résultat). */
interface SerializedResponse {
  statusCode?: unknown;
  headers?: unknown;
}

export function serializeResponse(response: SerializedResponse): Record<string, unknown> {
  return {
    statusCode: response.statusCode,
    headers: redactHeaders(response.headers, RESPONSE_SECRET_HEADERS),
  };
}
