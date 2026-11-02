import type { IncomingMessage } from "node:http";

/**
 * Faux API des réglages de l'IA : `llmCredential.list|set|verify|remove` (contrat 0.9.0), sans Postgres ni
 * fournisseur. C'est le « faux fournisseur » des e2e : aucun appel réel à Anthropic. La clé de test est une
 * sentinelle clairement factice (jamais une forme réaliste de clé). Branché sur stub-api.ts, piloté par le scénario
 * (`llm`). Le stub est avec état (comme l'API) : un `set` réussi fait apparaître la clé dans `list`, un `remove`
 * la retire. Les appels reçus sont consultables par `GET /__llm-calls` (corps compris : c'est le SEUL endroit où la
 * valeur de la clé doit exister côté serveur) ; `GET /__llm-secret-leaks` renvoie le nombre de requêtes
 * (hors corps du PUT) dont l'URL, la query ou les en-têtes contiennent la sentinelle.
 *
 * Modes (`llm`) :
 * - `list` : `absent` (défaut) | `configured` | `invalid` | `loading` (retenu jusqu'à POST /__release) | `internal` | `forbidden` ;
 * - `set` : `ok` (défaut) | `encryption` (503) | `validation` (422) | `internal` (500) | `hold` (retenu) ;
 * - `verify` : `ok` (défaut) | `auth` | `rateLimited` (429, 30 s) | `quota` | `unavailable` | `undecryptable` |
 *   `invalidated` | `encryption` | `hold` ;
 * - `remove` : `ok` (défaut) | `notFound` (404) | `internal`.
 */
export type LlmListMode =
  | "absent"
  | "configured"
  | "invalid"
  | "loading"
  | "internal"
  | "forbidden";
export type LlmSetMode = "ok" | "encryption" | "validation" | "internal" | "hold";
export type LlmVerifyMode =
  | "ok"
  | "auth"
  | "rateLimited"
  | "quota"
  | "unavailable"
  | "undecryptable"
  | "invalidated"
  | "encryption"
  | "hold";
export type LlmRemoveMode = "ok" | "notFound" | "internal";
export type LlmScenario = {
  llm?: { list?: LlmListMode; set?: LlmSetMode; verify?: LlmVerifyMode; remove?: LlmRemoveMode };
};

/** Clé de test des e2e : factice, fixe, reconnaissable (jamais `sk-ant-…`). */
export const E2E_SECRET = "FAKE-KEY-NOT-REAL-e2e-5c1d8a07b3f64e92";
export const E2E_MODEL = "claude-e2e-1";

type Reply = { status: number; body: string };
type Send = (reply: Reply) => void;
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });
const typed = (status: number, code: string, data?: unknown): Reply =>
  reply(status, { defined: true, code, message: code, ...(data === undefined ? {} : { data }) });

interface Call {
  method: string;
  path: string;
  /** Corps JSON reçu (le PUT porte la clé). */
  body: unknown;
}
const calls: Call[] = [];
let leaks = 0;
let stored: Record<string, unknown> | null = null;
/** Après un `remove` réussi, `list` ne montre plus la clé du scénario (jusqu'au prochain `set`). */
let removed = false;

export function resetLlm(): void {
  calls.length = 0;
  leaks = 0;
  stored = null;
  removed = false;
}

const status = (over: Record<string, unknown> = {}) => ({
  provider: "anthropic",
  configured: true,
  invalid: false,
  createdAt: "2026-10-20T12:00:00.000Z",
  updatedAt: "2026-10-20T12:00:00.000Z",
  ...over,
});

function current(mode: LlmListMode): Record<string, unknown> | null {
  if (stored) return stored;
  if (removed) return null;
  if (mode === "configured") return status({ lastUsedAt: "2026-11-02T12:00:00.000Z" });
  if (mode === "invalid")
    return status({ invalid: true, invalidatedAt: "2026-10-28T12:00:00.000Z" });
  return null;
}

function listResponse(mode: LlmListMode): Reply {
  if (mode === "internal")
    return reply(500, { defined: false, code: "INTERNAL", message: "Internal error" });
  if (mode === "forbidden") return typed(403, "FORBIDDEN");
  const item = current(mode);
  return reply(200, { items: item ? [item] : [] });
}

function setResponse(mode: LlmSetMode, body: Record<string, unknown>): Reply {
  if (mode === "encryption") return typed(503, "ENCRYPTION_UNAVAILABLE");
  if (mode === "validation") {
    return typed(422, "VALIDATION", { field: "apiKey", message: "invalid" });
  }
  if (mode === "internal")
    return reply(500, { defined: false, code: "INTERNAL", message: "Internal error" });
  removed = false;
  stored = status(typeof body.defaultModel === "string" ? { defaultModel: body.defaultModel } : {});
  return reply(200, stored);
}

function verifyResponse(mode: LlmVerifyMode): Reply {
  switch (mode) {
    case "auth":
      return typed(502, "LLM_PROVIDER_ERROR", { reason: "auth" });
    case "quota":
      return typed(502, "LLM_PROVIDER_ERROR", { reason: "quota" });
    case "unavailable":
      return typed(502, "LLM_PROVIDER_ERROR", { reason: "unavailable" });
    case "rateLimited":
      return typed(429, "LLM_RATE_LIMITED", { retryAfterSeconds: 30 });
    case "undecryptable":
    case "invalidated":
      return typed(409, "LLM_NOT_CONFIGURED", { reason: mode });
    case "encryption":
      return typed(503, "ENCRYPTION_UNAVAILABLE");
    default:
      return reply(200, { ok: true, model: E2E_MODEL, checkedAt: "2026-11-02T12:00:00.000Z" });
  }
}

function removeResponse(mode: LlmRemoveMode): Reply {
  if (mode === "notFound") return typed(404, "NOT_FOUND");
  if (mode === "internal")
    return reply(500, { defined: false, code: "INTERNAL", message: "Internal error" });
  stored = null;
  removed = true;
  return reply(200, { removed: true });
}

function readBody(req: IncomingMessage, done: (body: Record<string, unknown>) => void): void {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => {
    try {
      done(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
    } catch {
      done({});
    }
  });
}

export function handleLlm(
  req: IncomingMessage,
  url: URL,
  context: { scenario: LlmScenario; send: Send; hold: (release: () => void) => void },
): boolean {
  const { scenario, send, hold } = context;
  const path = url.pathname;
  if (path === "/__llm-calls") return void send(reply(200, calls)) === undefined;
  if (path === "/__llm-secret-leaks") return void send(reply(200, { leaks })) === undefined;
  if (!path.endsWith("/llm-credentials") && !path.includes("/llm-credentials/")) return false;
  // La clé ne doit voyager que dans le corps du PUT : ni dans l'URL, ni dans la query, ni dans un en-tête.
  const outsideBody = `${req.url ?? ""}\n${JSON.stringify(req.headers)}`;
  if (outsideBody.includes("FAKE-KEY-NOT-REAL")) leaks += 1;

  const mode = scenario.llm ?? {};
  const respond = (held: boolean, make: () => Reply) =>
    held ? hold(() => send(make())) : send(make());

  if (req.method === "GET" && path.endsWith("/llm-credentials")) {
    calls.push({ method: "GET", path, body: null });
    const list = mode.list ?? "absent";
    respond(list === "loading", () => listResponse(list === "loading" ? "configured" : list));
    return true;
  }
  readBody(req, (body) => {
    calls.push({ method: req.method ?? "", path, body });
    if (req.method === "PUT") {
      const set = mode.set ?? "ok";
      respond(set === "hold", () => setResponse(set === "hold" ? "ok" : set, body));
    } else if (req.method === "POST" && path.endsWith("/verify")) {
      const verify = mode.verify ?? "ok";
      respond(verify === "hold", () => verifyResponse(verify === "hold" ? "ok" : verify));
    } else if (req.method === "DELETE") {
      send(removeResponse(mode.remove ?? "ok"));
    } else {
      send(typed(404, "NOT_FOUND"));
    }
  });
  return true;
}
