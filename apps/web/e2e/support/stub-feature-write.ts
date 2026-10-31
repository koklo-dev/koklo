import type { IncomingMessage } from "node:http";

/**
 * Faux API de l'écriture de la spec (TK-48 / 48e) : `specBatch.submit` et `specBatch.get`. C'est le faux
 * fournisseur des e2e du formulaire de fonctionnalité : aucune requête ne part vers github.com ni vers une base.
 * Piloté par le scénario (`write`) ; l'état d'écriture (version de la spec, fonctionnalités créées ou
 * renommées) est lu par stub-features.ts, si bien que la liste relue après un enregistrement est à jour.
 * Les corps reçus par `submit` et les lots lus par `get` sont consultables par `/__spec-writes`.
 *
 * Modes (`write`) :
 * - `ok` : le lot est committed dans la réponse, l'index suit tout de suite ;
 * - `queued` : `submit` répond « en attente », `get` répond committing puis committed (2 lectures) ;
 * - `queuedForever` : le lot reste en attente (dépassement des 60 s) ;
 * - `indexLate` : committed mais l'index ne rattrape jamais la version (« Pas encore à jour ») ;
 * - `hold` : `submit` est retenu jusqu'à POST /__release (état « envoi ») ;
 * - `invalid` : 422 SPEC_INVALID avec rapport ; `provider` : 503 ; `forbidden` : 403 ;
 * - `conflictOnce` : le premier envoi avec `baseSha` répond 409 stale_base et la spec change (nouvelle
 *   version, titre de F-001 modifié), le suivant réussit.
 */
export type WriteMode =
  | "ok"
  | "queued"
  | "queuedForever"
  | "indexLate"
  | "hold"
  | "invalid"
  | "provider"
  | "forbidden"
  | "conflictOnce";
export type FeatureWriteScenario = { write?: WriteMode };

type Reply = { status: number; body: string };
type Send = (reply: Reply) => void;
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });
const typed = (status: number, code: string, data?: unknown): Reply =>
  reply(status, { defined: true, code, message: code, ...(data === undefined ? {} : { data }) });

export const BASE_SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const SHAS = [
  "b2c3d4e5f60718293a4b5c6d7e8f9012345678ab",
  "c3d4e5f60718293a4b5c6d7e8f9012345678abc",
  "d4e5f60718293a4b5c6d7e8f9012345678abcde",
  "e5f60718293a4b5c6d7e8f9012345678abcdef0",
];
const BATCH_ID = "01900000-0000-7000-8000-0000000000d1";

export interface CreatedFeature {
  specId: string;
  title: string;
  status: string;
  priority: string;
  criteriaCount: number;
}
interface Batch {
  id: string;
  status: string;
  commitSha: string | null;
  results: Array<{ position: number; kind: string; specId: string | null }>;
  reads: number;
  body: Record<string, unknown>;
}

let commits = 0;
let created: CreatedFeature[] = [];
let titles: Record<string, string> = {};
let batches: Batch[] = [];
let conflicted = false;
const journal: unknown[] = [];

export function resetFeatureWrites(): void {
  commits = 0;
  created = [];
  titles = {};
  batches = [];
  conflicted = false;
  journal.length = 0;
}
/** Version de la spec lue par `spec.head` et `spec.getFeature` (l'index suit les commits). */
export const currentSha = (lateIndex = false): string =>
  commits === 0 || lateIndex ? BASE_SHA : (SHAS[commits - 1] ?? BASE_SHA);
export const createdFeatures = (): CreatedFeature[] => created;
export const renamed = (specId: string): string | undefined => titles[specId];
export const writeCount = (): number => created.length + Object.keys(titles).length;

const nextId = (): string => `F-${String(4 + created.length).padStart(3, "0")}`;

function apply(body: Record<string, unknown>): Batch["results"] {
  const op = (body.operations as Array<Record<string, unknown>>)[0] ?? {};
  if (op.kind === "feature.create") {
    const specId = nextId();
    created.push({
      specId,
      title: String(op.title),
      status: String(op.status ?? "brouillon"),
      priority: String(op.priority),
      criteriaCount: Array.isArray(op.criteria) ? op.criteria.length : 0,
    });
    return [{ position: 0, kind: "feature.create", specId }];
  }
  const specId = String(op.specId);
  if (typeof op.title === "string") titles[specId] = op.title;
  return [{ position: 0, kind: String(op.kind), specId }];
}

const batchView = (batch: Batch, mode: WriteMode) => ({
  id: batch.id,
  branch: "main",
  status: batch.status,
  idempotencyKey: String(batch.body.idempotencyKey),
  baseSha: (batch.body.baseSha as string | undefined) ?? null,
  commitSha: batch.commitSha,
  errorCode: null,
  report: null,
  results: batch.results,
  enqueuedAt: "2026-10-31T12:00:00.000Z",
  committedAt: batch.status === "committed" ? "2026-10-31T12:00:02.000Z" : null,
  ...(mode === "indexLate" ? {} : {}),
});

const REPORT = {
  ok: false,
  counts: { error: 2, warning: 0 },
  truncated: false,
  issues: [
    {
      rule: 4,
      code: "unknown_screen",
      severity: "error",
      path: "features/F-004.md",
      pointer: "/screens/0",
      entityId: "S-inconnu",
      message: "L'écran S-inconnu n'existe pas dans la spec.",
    },
    {
      rule: "structure",
      code: "bad_shape",
      severity: "error",
      path: "features/F-004.md",
      pointer: "/schemaVersion",
      message: "La structure du fichier est inattendue.",
    },
  ],
};

function commit(batch: Batch): void {
  commits += 1;
  batch.status = "committed";
  batch.commitSha = SHAS[commits - 1] ?? BASE_SHA;
}

function refusal(mode: WriteMode, body: Record<string, unknown>): Reply | null {
  if (mode === "invalid") return typed(422, "SPEC_INVALID", { report: REPORT });
  if (mode === "provider") return typed(503, "PROVIDER_UNAVAILABLE");
  if (mode === "forbidden") return typed(403, "FORBIDDEN");
  if (mode === "conflictOnce" && !conflicted && body.baseSha) {
    conflicted = true;
    commits += 1; // quelqu'un d'autre a écrit : la version lue change
    titles["F-001"] = "Titre de la spec";
    return typed(409, "SPEC_BATCH_CONFLICT", { reason: "stale_base", batchId: BATCH_ID });
  }
  return null;
}

function readBody(req: IncomingMessage, done: (body: Record<string, unknown>) => void): void {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => done(JSON.parse(raw || "{}")));
}

interface Handlers {
  mode: WriteMode;
  knownProject: (id: string) => boolean;
  send: Send;
  hold: (release: () => void) => void;
}

function submit(body: Record<string, unknown>, h: Handlers): void {
  journal.push({ kind: "submit", ...body });
  const refused = refusal(h.mode, body);
  if (refused) {
    h.send(refused);
    return;
  }
  const existing = batches.find((b) => b.body.idempotencyKey === body.idempotencyKey);
  const batch: Batch = existing ?? {
    id: BATCH_ID,
    status: "queued",
    commitSha: null,
    results: apply(body),
    reads: 0,
    body,
  };
  if (!existing) batches.push(batch);
  const queuedMode = h.mode === "queued" || h.mode === "queuedForever";
  if (!queuedMode && batch.status !== "committed") commit(batch);
  const answer = reply(200, batchView(batch, h.mode));
  if (h.mode === "hold") h.hold(() => h.send(answer));
  else h.send(answer);
}

function get(id: string, h: Handlers): void {
  const batch = batches.find((b) => b.id === id);
  if (!batch) {
    h.send(typed(404, "NOT_FOUND"));
    return;
  }
  batch.reads += 1;
  journal.push({ kind: "get", batchId: id, read: batch.reads });
  if (h.mode === "queued" && batch.status === "queued" && batch.reads === 1)
    batch.status = "committing";
  else if (h.mode === "queued" && batch.reads >= 2 && batch.status !== "committed") commit(batch);
  h.send(reply(200, batchView(batch, h.mode)));
}

const ROUTE = /^\/projects\/([^/]+)\/spec\/batches(?:\/([^/]+))?$/;

export function handleFeatureWrites(req: IncomingMessage, url: URL, h: Handlers): boolean {
  if (url.pathname === "/__spec-writes") {
    h.send(reply(200, journal));
    return true;
  }
  const match = ROUTE.exec(url.pathname);
  if (!match) return false;
  const [, projectId = "", batchId] = match;
  if (!h.knownProject(projectId)) {
    h.send(typed(404, "NOT_FOUND"));
    return true;
  }
  if (req.method === "POST" && !batchId) {
    readBody(req, (body) => submit({ projectId, ...body }, h));
    return true;
  }
  if (req.method === "GET" && batchId) {
    get(batchId, h);
    return true;
  }
  return false;
}
