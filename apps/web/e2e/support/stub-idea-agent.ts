import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Faux API de l'espace Idée et de son agent (TK-90) : pages, propositions, fil et flux SSE d'un modèle SIMULÉ. Aucun
 * appel réel, aucune clé, aucun Postgres. Piloté par le scénario (`idea`) ; chaque sélection de mode remet le monde
 * à neuf (`resetIdea`). Les messages reçus par `ai.ideaChat` sont consultables par `/__idea-chats`.
 *
 * Modes (`idea`) :
 * - `empty` : dossier vide, aucun message (premier message fixe) ;   `thread` : un échange et des manques ;
 * - `proposal` : une proposition d'ajout sur Périmètre ;   `proposals` : trois propositions (ajout, remplacement, fin) ;
 * - `replace` : un remplacement ;   `pagePending` : une page proposée et une proposition ;   `pagesMany` : cinq pages proposées ;   `stale` : proposition périmée ;
 * - `hostile` : proposition pleine de HTML, de liens et d'images ;   `notConfigured` : pas de clé d'IA ;
 * - `rateLimited` : l'envoi est refusé (429) ;   `streaming` : le flux reste ouvert jusqu'à POST /__release.
 */
export type IdeaMode =
  | "empty"
  | "thread"
  | "proposal"
  | "proposals"
  | "replace"
  | "pagePending"
  | "pagesMany"
  | "stale"
  | "hostile"
  | "notConfigured"
  | "rateLimited"
  | "streaming";
export type IdeaScenario = { idea?: IdeaMode };

export const IDEA_PROJECT_ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01";
const BASE = `/projects/${IDEA_PROJECT_ID}`;
const STAMP = "2026-11-08T10:00:00.000Z";
const uuid = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const MARIE = { name: "Marie Lefèvre", isClient: true };

interface Page {
  id: string;
  slug: string;
  title: string;
  position: number;
  required: boolean;
  version: number;
  contentMd: string;
  status: string;
}
interface Proposal {
  id: string;
  messageId: string;
  pageId: string | null;
  op: string;
  anchorBlockIndex: number | null;
  rangeEnd: number | null;
  title: string | null;
  afterPageId: string | null;
  contentMd: string;
  rationale: string;
  baseVersion: number | null;
  status: string;
  createdAt: string;
  previous?: string;
}
interface Message {
  id: string;
  pageId: string | null;
  author: { name: string; isClient: boolean } | null;
  mode: "interview" | "free";
  text: string;
  createdAt: string;
}

const PERIMETRE = uuid(3);
const hostileText =
  "<script>alert(1)</script> [cliquez](http://evil.example) ![i](http://evil.example/x.png) javascript:alert(1)";
const seedPages = (): Page[] => [
  {
    id: uuid(1),
    slug: "01-vision",
    title: "Vision",
    position: 0,
    required: true,
    version: 2,
    status: "stable",
    contentMd: "Un portail pour réserver sans appeler l'accueil.\n",
  },
  {
    id: uuid(2),
    slug: "02-probleme",
    title: "Problème",
    position: 1,
    required: true,
    version: 2,
    status: "draft",
    contentMd: "L'accueil perd du temps au téléphone.\n",
  },
  {
    id: PERIMETRE,
    slug: "05-perimetre",
    title: "Périmètre",
    position: 2,
    required: true,
    version: 3,
    status: "draft",
    contentMd:
      "Ce qui entre dans la première version du portail.\n\n### Première version\n\n- Réserver un créneau\n- Annuler une réservation\n\n### Plus tard\n\n- Programme de fidélité\n",
  },
];

let pages: Page[] = seedPages();
let proposals: Proposal[] = [];
let messages: Message[] = [];
let chats: unknown[] = [];
let mode: IdeaMode = "thread";
const held: Array<() => void> = [];
let counter = 100;

const proposal = (n: number, over: Partial<Proposal>): Proposal => ({
  id: uuid(200 + n),
  messageId: uuid(300),
  pageId: PERIMETRE,
  op: "insert_after",
  anchorBlockIndex: 4,
  rangeEnd: null,
  title: null,
  afterPageId: null,
  contentMd:
    "### Hors périmètre\n\n- Paiement en ligne : le paiement se fait sur place au lancement.\n- Export comptable : géré dans le logiciel de caisse actuel.",
  rationale: "suite à la réponse de Marie",
  baseVersion: 3,
  status: "pending",
  createdAt: STAMP,
  ...over,
});

/** Cinq pages proposées : trois cartes, puis « 2 autres ». */
const manyPageProposals = (): Proposal[] =>
  [2, 3, 4, 5, 6].map((n) =>
    proposal(n, {
      op: "create_page",
      pageId: null,
      baseVersion: null,
      anchorBlockIndex: null,
      title: `Page proposée ${n - 1}`,
      afterPageId: PERIMETRE,
      contentMd: "### Titre\n\n- À lister",
      rationale: `Raison ${n - 1}.`,
    }),
  );

const THREAD: Message[] = [
  {
    id: uuid(400),
    pageId: PERIMETRE,
    author: null,
    mode: "interview",
    text: "Pour la première version, le paiement en ligne est-il indispensable, ou le paiement sur place suffit ?",
    createdAt: "2026-11-08T09:58:00.000Z",
  },
  {
    id: uuid(401),
    pageId: PERIMETRE,
    author: MARIE,
    mode: "interview",
    text: "Sur place au début. On verra le paiement en ligne quand on aura du recul.",
    createdAt: "2026-11-08T09:59:00.000Z",
  },
  {
    id: uuid(402),
    pageId: PERIMETRE,
    author: null,
    mode: "interview",
    text: "Noté. Je propose une section « Hors périmètre ». Prochaine question : l'agenda du personnel doit-il être prêt au lancement ?",
    createdAt: "2026-11-08T10:00:00.000Z",
  },
];

export function resetIdea(scenario: IdeaScenario): void {
  mode = scenario.idea ?? "thread";
  pages = seedPages();
  chats = [];
  held.length = 0;
  messages = mode === "empty" || mode === "notConfigured" ? [] : THREAD.map((m) => ({ ...m }));
  const base: Record<string, Proposal[]> = {
    proposal: [proposal(1, {})],
    proposals: [
      proposal(1, {
        anchorBlockIndex: 0,
        contentMd: "Le critère : réserver seul, du téléphone.",
        rationale: "précision",
      }),
      proposal(2, {
        op: "replace",
        anchorBlockIndex: 3,
        rangeEnd: 4,
        contentMd: "- Réserver un créneau en moins de deux minutes\n- Annuler en un geste",
        rationale: "plus précis",
      }),
      proposal(3, {
        op: "append",
        anchorBlockIndex: null,
        contentMd: "### Hors périmètre\n\n- Paiement en ligne",
        rationale: "d'après la réponse de Marie",
      }),
    ],
    replace: [
      proposal(1, {
        op: "replace",
        anchorBlockIndex: 3,
        rangeEnd: 3,
        contentMd: "- Réserver un créneau en moins de deux minutes",
        rationale: "plus précis",
      }),
    ],
    pagePending: [
      proposal(1, {}),
      proposal(2, {
        op: "create_page",
        pageId: null,
        baseVersion: null,
        anchorBlockIndex: null,
        title: "Concurrence et alternatives",
        afterPageId: PERIMETRE,
        contentMd: "### Concurrents\n\n- À lister",
        rationale: "Marie cite 3 concurrents dans Problème et Proposition de valeur.",
      }),
    ],
    pagesMany: manyPageProposals(),
    stale: [proposal(1, { status: "stale" })],
    hostile: [proposal(1, { contentMd: hostileText, rationale: "<b>important</b>" })],
  };
  proposals = base[mode] ?? [];
}

type Reply = { status: number; body: string };
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });
const typed = (status: number, code: string, data?: unknown): Reply =>
  reply(status, { defined: true, code, message: code, ...(data === undefined ? {} : { data }) });

const view = ({ previous: _previous, ...rest }: Proposal) => rest;
const open = (id: string | null) =>
  proposals.filter((p) => p.pageId === id && p.status === "pending" && p.op !== "create_page");
const summary = (p: Page) => ({
  id: p.id,
  slug: p.slug,
  title: p.title,
  position: p.position,
  required: p.required,
  origin: "template",
  status: p.status,
  version: p.version,
  updatedAt: STAMP,
  updatedBy: null,
  deletedAt: null,
});
const withContent = (p: Page) => ({ ...summary(p), contentMd: p.contentMd });
const listed = () => ({
  pages: pages.map((p) => ({ ...summary(p), pendingProposals: open(p.id).length })),
  trash: [],
  total: pages.length,
  publication: { available: false, last: null },
  pendingPageProposals: proposals
    .filter((p) => p.op === "create_page" && p.status === "pending")
    .map(view),
});
const detail = (p: Page) => ({
  ...withContent(p),
  proposals: proposals
    .filter((x) => x.pageId === p.id && (x.status === "pending" || x.status === "stale"))
    .map(view),
});

const blocks = (md: string): string[] =>
  md
    .split(/\n{2,}/)
    .map((b) => b.replace(/\n+$/, ""))
    .filter(Boolean);

function apply(p: Page, prop: Proposal, text: string): void {
  const list = blocks(p.contentMd);
  const from = prop.anchorBlockIndex ?? 0;
  if (prop.op === "append") list.push(text);
  else if (prop.op === "insert_after") list.splice(from + 1, 0, text);
  else list.splice(from, (prop.rangeEnd ?? from) - from + 1, text);
  p.contentMd = `${list.join("\n\n")}\n`;
  p.version += 1;
}

function createPage(prop: Proposal, text: string): Reply {
  const created: Page = {
    id: uuid(++counter),
    slug: "09-concurrence",
    title: prop.title ?? "Page",
    position: pages.length,
    required: false,
    version: 1,
    status: "draft",
    contentMd: `${text}\n`,
  };
  pages.push(created);
  return reply(200, { proposal: view(prop), page: withContent(created) });
}

function decide(id: string, body: Record<string, unknown>): Reply {
  const prop = proposals.find((p) => p.id === id);
  if (!prop) return typed(404, "NOT_FOUND");
  if (prop.status === "stale" && body.decision !== "reject")
    return typed(409, "CONFLICT", { reason: "stale", currentVersion: 4 });
  if (body.decision === "reject") {
    prop.status = "rejected";
    return reply(200, { proposal: view(prop), page: null });
  }
  const text = typeof body.contentMd === "string" ? body.contentMd : prop.contentMd;
  prop.status = "accepted";
  if (prop.op === "create_page") return createPage(prop, text);
  const page = pages.find((p) => p.id === prop.pageId);
  if (!page) return typed(404, "NOT_FOUND");
  prop.previous = page.contentMd;
  apply(page, prop, text);
  for (const other of proposals)
    if (other.pageId === page.id && other.status === "pending") other.status = "stale";
  return reply(200, { proposal: view(prop), page: withContent(page) });
}

function undo(id: string): Reply {
  const prop = proposals.find((p) => p.id === id);
  if (!prop) return typed(404, "NOT_FOUND");
  const page = pages.find((p) => p.id === prop.pageId);
  if (prop.status === "accepted" && page && prop.previous !== undefined) {
    page.contentMd = prop.previous;
    page.version += 1;
  }
  prop.status = "pending";
  return reply(200, { proposal: view(prop), page: page ? withContent(page) : null });
}

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const WITH_PROPOSALS = new Set(["develop", "simplify", "make_page"]);
const ANSWER = "Noté. Je regarde ce passage et je reviens avec une proposition.";

function remember(body: Record<string, unknown>): string {
  const pageId = typeof body.pageId === "string" ? body.pageId : null;
  const chatMode = body.mode === "free" ? "free" : "interview";
  const now = new Date().toISOString();
  messages.push({
    id: uuid(++counter),
    pageId,
    author: MARIE,
    mode: chatMode,
    text: String(body.text),
    createdAt: now,
  });
  const messageId = uuid(++counter);
  messages.push({
    id: messageId,
    pageId,
    author: null,
    mode: chatMode,
    text: ANSWER,
    createdAt: new Date(Date.now() + 1).toISOString(),
  });
  return messageId;
}

function finishStream(res: ServerResponse, body: Record<string, unknown>): void {
  res.write(sse("message", { type: "text", text: "et je reviens avec une proposition." }));
  const messageId = remember(body);
  if (WITH_PROPOSALS.has(String(body.action))) {
    const made = proposal(++counter - 100, {
      messageId,
      op: "append",
      anchorBlockIndex: null,
      contentMd: "### Section proposée\n\n- Point à valider",
      rationale: "demandé par la sélection",
    });
    proposals.push(made);
    res.write(sse("message", { type: "proposals", proposals: [view(made)] }));
  }
  res.write(sse("message", { type: "done", messageId }));
  res.end("event: close\n\n");
}

/** Flux SSE du modèle simulé ; `streaming` le garde ouvert jusqu'à la libération. */
function streamChat(res: ServerResponse, body: Record<string, unknown>): void {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
  });
  res.write(sse("message", { type: "text", text: "Noté. Je regarde ce passage " }));
  if (mode === "streaming") held.push(() => finishStream(res, body));
  else finishStream(res, body);
}

const GAPS = {
  items: [
    { pageId: uuid(1), suggestedPageTitle: null, text: "aucun indicateur de succès." },
    {
      pageId: null,
      suggestedPageTitle: "Concurrence et alternatives",
      text: "Aucune page sur la concurrence.",
    },
  ],
  computedAt: STAMP,
  cached: false,
};

function readBody(req: IncomingMessage, done: (body: Record<string, unknown>) => void): void {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => done(JSON.parse(raw || "{}")));
}

const lockedOut = (role: string | undefined): boolean => role === "business";

function messageList() {
  return reply(200, {
    items: messages,
    nextCursor: null,
    previousCursor: null,
    offset: 0,
    total: messages.length,
  });
}

function savePage(id: string, body: Record<string, unknown>): Reply {
  const page = pages.find((p) => p.id === id);
  if (!page) return typed(404, "NOT_FOUND");
  page.contentMd = String(body.contentMd);
  page.version += 1;
  for (const other of proposals)
    if (other.pageId === page.id && other.status === "pending") other.status = "stale";
  return reply(200, withContent(page));
}

/** Lectures de l'Idée : pages, page, état de l'agent, fil. */
function read(rest: string, role: string | undefined): Reply {
  if (rest === "/idea/pages") return reply(200, listed());
  if (rest === "/idea/agent") {
    const canConfigure = role === undefined || role === "owner" || role === "admin";
    return reply(200, { configured: mode !== "notConfigured", canConfigure });
  }
  if (rest === "/idea/messages") return messageList();
  const id = /^\/idea\/pages\/([^/]+)$/.exec(rest)?.[1];
  const found = pages.find((p) => p.id === id);
  return found ? reply(200, detail(found)) : typed(404, "NOT_FOUND");
}

/** Écritures de l'Idée ; `null` : route inconnue. */
function write(rest: string, body: Record<string, unknown>): Reply | null {
  const save = /^\/idea\/pages\/([^/]+)\/content$/.exec(rest);
  const decision = /^\/idea\/proposals\/([^/]+)\/(decision|undo)$/.exec(rest);
  if (rest === "/ai/idea/gaps") return reply(200, GAPS);
  if (save) return savePage(save[1] ?? "", body);
  if (!decision) return null;
  return decision[2] === "undo" ? undo(decision[1] ?? "") : decide(decision[1] ?? "", body);
}

function respond(
  method: string,
  rest: string,
  body: Record<string, unknown>,
  role: string | undefined,
): Reply | null {
  if (method === "GET") return read(rest, role);
  if (rest === "/idea/presence") return reply(200, { present: [] });
  return lockedOut(role) ? typed(403, "FORBIDDEN") : write(rest, body);
}

function chat(
  res: ServerResponse,
  body: Record<string, unknown>,
  role: string | undefined,
): Reply | null {
  chats.push(body);
  if (lockedOut(role)) return typed(403, "FORBIDDEN");
  if (mode === "rateLimited") return typed(429, "LLM_RATE_LIMITED", { retryAfterSeconds: 5 });
  if (mode === "notConfigured") return typed(409, "LLM_NOT_CONFIGURED", { reason: "missing" });
  streamChat(res, body);
  return null;
}

const isIdeaRoute = (rest: string) => /^\/(idea|ai\/idea)\//.test(rest);

/** Le faux API de l'Idée : renvoie `true` si la requête est la sienne. */
export function handleIdea(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  role: string | undefined,
): boolean {
  const path = url.pathname;
  if (path === "/__idea-chats") return send(res, reply(200, chats));
  if (path === "/__release-idea") {
    for (const release of held.splice(0)) release();
    return send(res, reply(200, {}));
  }
  const rest = path.startsWith(`${BASE}/`) ? path.slice(BASE.length) : "";
  if (!isIdeaRoute(rest)) return false;
  readBody(req, (body) => {
    const answer =
      rest === "/ai/idea/chat"
        ? chat(res, body, role)
        : (respond(req.method ?? "GET", rest, body, role) ?? typed(404, "NOT_FOUND"));
    if (answer) send(res, answer);
  });
  return true;
}

function send(res: ServerResponse, answer: Reply): true {
  res.writeHead(answer.status, { "content-type": "application/json" }).end(answer.body);
  return true;
}
