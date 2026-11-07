import type { IncomingMessage } from "node:http";

/**
 * Faux API de l'écran « Fournisseurs d'IA » (contrat 2.3.0) : `aiProvider.*`, `aiModel.listQualified`,
 * `aiUsage.set|report`, `aiSettings.get|update`, sans Postgres ni fournisseur réel. La clé de test est une sentinelle
 * clairement factice. Le stub est avec état (comme l'API) : un ajout réussi fait apparaître la ligne, un retrait la
 * supprime. Les appels reçus sont consultables par `GET /__ai-provider-calls` (corps compris : c'est le SEUL endroit
 * où la clé doit exister) ; `GET /__ai-provider-leaks` renvoie le nombre de requêtes dont l'URL, la query ou les
 * en-têtes contiennent la sentinelle.
 *
 * Scénario (`providers`) : `list` : `empty` (défaut) | `one` | `two` | `three` | `invalid` | `loading` (retenu jusqu'à
 * POST /__release) | `internal` | `forbidden` ; `add` : `ok` | `auth` (502) | `hold` ; `report` : `ok` | `warning` |
 * `suspended` | `none`.
 */
export type ProvidersList =
  | "empty"
  | "one"
  | "two"
  | "three"
  | "invalid"
  | "loading"
  | "internal"
  | "forbidden";
export type ProvidersScenario = {
  providers?: {
    list?: ProvidersList;
    add?: "ok" | "auth" | "hold";
    report?: "ok" | "warning" | "suspended" | "none";
  };
};

export const E2E_SECRET = "FAKE-KEY-NOT-REAL-e2e-5c1d8a07b3f64e92";

type Reply = { status: number; body: string };
type Send = (reply: Reply) => void;
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });
const typed = (status: number, code: string, data?: unknown): Reply =>
  reply(status, { defined: true, code, message: code, ...(data === undefined ? {} : { data }) });

interface Call {
  method: string;
  path: string;
  body: unknown;
}
interface Item {
  provider: string;
  role: "primary" | "fallback" | null;
  status: "verified" | "unverified" | "invalid";
  lastUsedAt: string;
  intermediary: boolean;
  euEligible: boolean;
  baseUrlRequired: boolean;
}
const USAGES = ["idea_space", "spec_deliverables", "baseline_summary", "ticket_breakdown"];
const MODELS = [
  { provider: "anthropic", model: "claude-e2e-sonnet", usages: USAGES, economy: false },
  { provider: "anthropic", model: "claude-e2e-haiku", usages: USAGES, economy: true },
  { provider: "openai", model: "gpt-e2e-1", usages: USAGES, economy: false },
  { provider: "google", model: "gemini-e2e-1", usages: USAGES, economy: true },
];

const calls: Call[] = [];
let leaks = 0;
let items: Item[] | null = null;
let fallbackEnabled = false;
let cap: number | null = null;
let usageChoices: Record<string, { provider: string; model: string }> = {};

export function resetProviders(): void {
  calls.length = 0;
  leaks = 0;
  items = null;
  fallbackEnabled = false;
  cap = null;
  usageChoices = {};
}

const line = (provider: string, role: Item["role"], over: Partial<Item> = {}): Item => ({
  provider,
  role,
  status: "verified",
  lastUsedAt: "2026-11-02T12:00:00.000Z",
  intermediary: provider === "openrouter",
  euEligible: provider !== "openrouter",
  baseUrlRequired: provider === "openai_compatible",
  ...over,
});

function seed(mode: ProvidersList): Item[] {
  if (mode === "one") return [line("anthropic", "primary")];
  if (mode === "two") return [line("anthropic", "primary"), line("openai", "fallback")];
  if (mode === "three") {
    return [line("anthropic", "primary"), line("openai", "fallback"), line("openrouter", null)];
  }
  if (mode === "invalid") {
    return [line("anthropic", "primary"), line("openai", "fallback", { status: "invalid" })];
  }
  return [];
}

const current = (mode: ProvidersList): Item[] => {
  items ??= seed(mode);
  return items;
};

function report(mode: "ok" | "warning" | "suspended" | "none") {
  const base = {
    month: "2026-11",
    providers:
      mode === "none"
        ? []
        : [
            {
              provider: "anthropic",
              calls: 12,
              inputTokens: 40000,
              outputTokens: 8000,
              costMicroUsd: 8100000,
            },
            {
              provider: "openai",
              calls: 3,
              inputTokens: 5000,
              outputTokens: 1000,
              costMicroUsd: 4300000,
            },
          ],
    totalCostMicroUsd: mode === "none" ? 0 : 12400000,
    capState: mode === "warning" || mode === "suspended" ? mode : "ok",
  };
  const capped = mode === "warning" || mode === "suspended" ? 15000000 : cap;
  return capped === null ? base : { ...base, monthlyCapMicroUsd: capped };
}

function settingsBody() {
  return {
    fallbackEnabled,
    ...(cap === null ? {} : { monthlyCapMicroUsd: cap }),
    usages: USAGES.map((usage) =>
      usageChoices[usage]
        ? { usage, ...usageChoices[usage], isDefault: false }
        : { usage, isDefault: true },
    ),
  };
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

type Mode = NonNullable<ProvidersScenario["providers"]>;

function add(mode: Mode, body: Record<string, unknown>): Reply {
  if (mode.add === "auth") return typed(502, "LLM_PROVIDER_ERROR", { reason: "auth" });
  const list = current(mode.list ?? "empty");
  const created = line(
    String(body.provider),
    list.length === 0 ? "primary" : list.some((i) => i.role === "fallback") ? null : "fallback",
  );
  list.push(created);
  return reply(200, created);
}

function writeUsage(path: string, body: Record<string, unknown>): Reply {
  const usage = path.split("/").pop() ?? "";
  if (body.model === null) delete usageChoices[usage];
  else usageChoices[usage] = { provider: String(body.provider), model: String(body.model) };
  return reply(200, { usage, isDefault: body.model === null, ...(usageChoices[usage] ?? {}) });
}

function writeSettings(body: Record<string, unknown>): Reply {
  if (typeof body.fallbackEnabled === "boolean") fallbackEnabled = body.fallbackEnabled;
  if ("monthlyCapMicroUsd" in body) cap = (body.monthlyCapMicroUsd as number | null) ?? null;
  return reply(200, settingsBody());
}

function promote(list: Item[], target: Item): void {
  for (const i of list) {
    if (i === target) i.role = "primary";
    else if (i.role === "primary") i.role = "fallback";
  }
}

function writeProvider(list: Item[], method: string, path: string): Reply {
  const match = /\/ai\/providers\/([a-z_]+)(?:\/(verify|key|primary))?$/.exec(path);
  const target = list.find((i) => i.provider === match?.[1]);
  if (!target) return typed(404, "NOT_FOUND");
  const action = match?.[2];
  if (action === "verify") {
    return reply(200, { ok: true, model: "m", checkedAt: "2026-11-07T10:00:00.000Z" });
  }
  if (action === "key") return reply(200, target);
  if (action === "primary") {
    promote(list, target);
    return reply(200, target);
  }
  if (method !== "DELETE") return typed(404, "NOT_FOUND");
  items = list.filter((i) => i !== target);
  return reply(200, { removed: true });
}

function write(mode: Mode, method: string, path: string, body: Record<string, unknown>): Reply {
  if (path.endsWith("/ai/providers")) return add(mode, body);
  if (path.includes("/ai/usages/")) return writeUsage(path, body);
  if (path.endsWith("/ai/settings")) return writeSettings(body);
  return writeProvider(current(mode.list ?? "empty"), method, path);
}

function read(mode: Mode, path: string): Reply {
  const list = mode.list ?? "empty";
  if (list === "internal") return reply(500, { defined: false, code: "INTERNAL", message: "x" });
  if (list === "forbidden") return typed(403, "FORBIDDEN");
  if (path.endsWith("/ai/models")) return reply(200, { items: MODELS });
  if (path.endsWith("/ai/usage")) return reply(200, report(mode.report ?? "ok"));
  if (path.endsWith("/ai/settings")) return reply(200, settingsBody());
  return reply(200, { items: current(list === "loading" ? "two" : list) });
}

const ROUTE =
  /\/ai\/(providers(\/[a-z_]+(\/(verify|key|primary))?)?|models|usages\/[a-z_]+|usage|settings)$/;

export function handleProviders(
  req: IncomingMessage,
  url: URL,
  context: { scenario: ProvidersScenario; send: Send; hold: (release: () => void) => void },
): boolean {
  const { scenario, send, hold } = context;
  const path = url.pathname;
  if (path === "/__ai-provider-calls") return void send(reply(200, calls)) === undefined;
  if (path === "/__ai-provider-leaks") return void send(reply(200, { leaks })) === undefined;
  if (!ROUTE.test(path)) return false;
  // La clé ne doit voyager que dans le corps : ni dans l'URL, ni dans la query, ni dans un en-tête.
  if (`${req.url ?? ""}\n${JSON.stringify(req.headers)}`.includes("FAKE-KEY-NOT-REAL")) leaks += 1;
  const mode = scenario.providers ?? {};
  const method = req.method ?? "GET";
  if (method === "GET") {
    calls.push({ method, path, body: null });
    const respond = () => send(read(mode, path));
    if (mode.list === "loading" && path.endsWith("/ai/providers")) hold(respond);
    else respond();
    return true;
  }
  readBody(req, (body) => {
    calls.push({ method, path, body });
    const respond = () => send(write(mode, method, path, body));
    if (mode.add === "hold" && path.endsWith("/ai/providers")) hold(respond);
    else respond();
  });
  return true;
}
