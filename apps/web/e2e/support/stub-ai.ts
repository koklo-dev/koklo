import type { IncomingMessage } from "node:http";

/**
 * Faux API des appels à l'IA (TK-59) : `ai.draftBrief` et `ai.proposeFeatures`. C'est le « modèle simulé » des e2e :
 * aucun appel réel à Anthropic, jamais de clé. Branché sur stub-api.ts, piloté par le scénario (`ai`) ; les corps
 * reçus sont consultables par `/__ai-calls` ; l'écriture reste celle de stub-feature-write.ts (`/__spec-writes`).
 *
 * Modes (`ai`) :
 * - `ok` : brief puis trois propositions (dont un doublon F-003) ;
 * - `duplicates` : toutes les propositions sont des doublons ; `empty` : aucune proposition ;
 * - `hostile` : brief et propositions pleins de HTML, javascript:, liens Markdown, //evil.com ;
 * - `hold` : la réponse est retenue jusqu'à POST /__release (état « génération en cours ») ;
 * - `notConfigured` | `invalidated` | `undecryptable` : 409 LLM_NOT_CONFIGURED (trois raisons) ;
 * - `rateLimited` : 429 LLM_RATE_LIMITED (retryAfterSeconds 30) ;
 * - `quota` | `providerError` | `unavailable` : 502 LLM_PROVIDER_ERROR (quota, timeout, unavailable) ;
 * - `outputInvalid` : 502 LLM_OUTPUT_INVALID ; `promptRejected` : 422 PROMPT_REJECTED rang 1 ;
 * - `encryption` : 503 ENCRYPTION_UNAVAILABLE.
 */
export type AiMode =
  | "ok"
  | "duplicates"
  | "empty"
  | "hostile"
  | "hold"
  | "notConfigured"
  | "invalidated"
  | "undecryptable"
  | "rateLimited"
  | "quota"
  | "providerError"
  | "unavailable"
  | "outputInvalid"
  | "promptRejected"
  | "encryption";
export type AiScenario = { ai?: AiMode };

type Reply = { status: number; body: string };
type Send = (reply: Reply) => void;
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });
const typed = (status: number, code: string, data?: unknown): Reply =>
  reply(status, { defined: true, code, message: code, ...(data === undefined ? {} : { data }) });

const META = {
  provider: "anthropic",
  model: "claude-test-1",
  usage: { inputTokens: 812, outputTokens: 344 },
};
const step = (type: string, text: string) => ({ type, text });
const criterion = (title: string) => ({
  title,
  steps: [
    step("etant_donne", `un contexte pour ${title}`),
    step("quand", "la personne agit"),
    step("alors", "le résultat attendu s'affiche"),
  ],
});
const feature = (title: string, priority: string, over: Record<string, unknown> = {}) => ({
  kind: "feature.create",
  title,
  priority,
  description: `Description de ${title}.\nSeconde ligne.`,
  criteria: [criterion(`Cas nominal de ${title}`), criterion(`Cas d'erreur de ${title}`)],
  ...over,
});

const BRIEF = {
  title: "Portail de réservation",
  problem: "Les clients appellent l'accueil pour réserver.",
  users: "Clients et personnel d'accueil.",
  expectedOutcome: "Réserver en ligne en moins de deux minutes.",
  constraints: "Mobile d'abord.",
  openQuestions: ["Faut-il un paiement en ligne ?", "Quels créneaux sont proposés ?"],
};
export const HOSTILE_TEXT =
  "<script>window.__pwned = 1</script> [x][1] javascript:alert(1) //evil.com www.evil.com **gras**";
const FEATURES = [
  feature("Réserver un créneau", "must"),
  feature("Annuler une réservation", "should"),
  feature("Rappel par SMS", "could"),
];

function features(mode: AiMode): unknown {
  if (mode === "empty") return { features: [], duplicates: [], meta: META };
  if (mode === "duplicates") {
    return {
      features: FEATURES.slice(0, 2),
      duplicates: [
        { index: 0, specId: "F-001" },
        { index: 1, specId: "F-002" },
      ],
      meta: META,
    };
  }
  if (mode === "hostile") {
    return {
      features: [
        feature(`Titre ${HOSTILE_TEXT}`, "must", { description: HOSTILE_TEXT }),
        FEATURES[1],
      ],
      duplicates: [],
      meta: META,
    };
  }
  return { features: FEATURES, duplicates: [{ index: 2, specId: "F-003" }], meta: META };
}

function brief(mode: AiMode): unknown {
  const body =
    mode === "hostile" ? { ...BRIEF, title: HOSTILE_TEXT, problem: HOSTILE_TEXT } : BRIEF;
  return { brief: body, meta: META };
}

const FAILURES: Partial<Record<AiMode, Reply>> = {
  notConfigured: typed(409, "LLM_NOT_CONFIGURED", { reason: "missing" }),
  invalidated: typed(409, "LLM_NOT_CONFIGURED", { reason: "invalidated" }),
  undecryptable: typed(409, "LLM_NOT_CONFIGURED", { reason: "undecryptable" }),
  rateLimited: typed(429, "LLM_RATE_LIMITED", { retryAfterSeconds: 30 }),
  quota: typed(502, "LLM_PROVIDER_ERROR", { reason: "quota" }),
  providerError: typed(502, "LLM_PROVIDER_ERROR", { reason: "timeout" }),
  unavailable: typed(502, "LLM_PROVIDER_ERROR", { reason: "unavailable" }),
  outputInvalid: typed(502, "LLM_OUTPUT_INVALID"),
  promptRejected: typed(422, "PROMPT_REJECTED", { rank: 1 }),
  encryption: typed(503, "ENCRYPTION_UNAVAILABLE"),
};

const journal: Array<{ kind: "brief" | "features"; body: Record<string, unknown> }> = [];
export function resetAi(): void {
  journal.length = 0;
}

interface Handlers {
  scenario: AiScenario;
  knownProject: (id: string) => boolean;
  send: Send;
  hold: (release: () => void) => void;
}

const ROUTE = /^\/projects\/([^/]+)\/ai\/(brief|features)$/;

function readBody(req: IncomingMessage, done: (body: Record<string, unknown>) => void): void {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => done(JSON.parse(raw || "{}")));
}

export function handleAi(req: IncomingMessage, url: URL, h: Handlers): boolean {
  if (url.pathname === "/__ai-calls") {
    h.send(reply(200, journal));
    return true;
  }
  const match = ROUTE.exec(url.pathname);
  if (!match || req.method !== "POST") return false;
  const [, projectId = "", which] = match;
  if (!h.knownProject(projectId)) {
    h.send(typed(404, "NOT_FOUND"));
    return true;
  }
  const mode = h.scenario.ai ?? "ok";
  readBody(req, (body) => {
    journal.push({ kind: which as "brief" | "features", body: { projectId, ...body } });
    const failure = FAILURES[mode];
    if (failure) return h.send(failure);
    const answer = reply(200, which === "brief" ? brief(mode) : features(mode));
    if (mode === "hold") h.hold(() => h.send(answer));
    else h.send(answer);
  });
  return true;
}
