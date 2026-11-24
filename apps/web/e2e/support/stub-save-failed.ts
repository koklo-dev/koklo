/**
 * Faux API de l'enregistrement échoué de l'Architecture (TK-114e, B668 à B674), mode `architectureSaveFailed` des
 * propositions : un lot `conflict` (`write_conflict`) tient les 122 acceptées ; le réessai (`skipConflicts`) écarte la
 * section dont l'identifiant existe déjà sur la tête (`exists`), la remet à relire et écrit le reste. Aucun appel réel.
 */
export const FAILED_BATCH_ID = "01900000-0000-7000-8000-0000000000f1";
const RETRY_BATCH_ID = "01900000-0000-7000-8000-0000000000f2";
/** Section déjà présente sur la tête de la spec (scénario staging). */
export const EXISTING_SECTION_TITLE = "Tâches, modèles de tâches et cycle de vie";

type Reply = { status: number; body: string };
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });

interface Held {
  id: string;
  status: "pending" | "accepted" | "rejected";
  appliedBatchId: string | null;
}
interface Operation {
  kind: string;
  title?: string;
}

/** Route des lots de la spec (`specBatch.submit`, `specBatch.get`). */
export const SAVE_ROUTE = /^\/projects\/[^/]+\/spec\/batches(?:\/([^/]+))?$/;

const slugOf = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const EXISTING_SECTION = `DOC-${slugOf(EXISTING_SECTION_TITLE)}`;

const batchView = (id: string, committed: boolean, extra: Record<string, unknown> = {}) => ({
  id,
  branch: "main",
  status: committed ? "committed" : "conflict",
  idempotencyKey: committed ? "retry" : "proposal-first",
  baseSha: null,
  commitSha: committed ? "f".repeat(40) : null,
  errorCode: committed ? null : "write_conflict",
  report: null,
  results: [],
  enqueuedAt: "2026-11-24T10:00:00.000Z",
  committedAt: committed ? "2026-11-24T10:00:02.000Z" : null,
  ...extra,
});

/** `specBatch.get` : le lot en conflit, ou le lot du réessai (enregistré). */
export function batchReply(path: string): Reply {
  const id = SAVE_ROUTE.exec(path)?.[1];
  if (id === FAILED_BATCH_ID) return reply(200, batchView(id, false));
  if (id === RETRY_BATCH_ID) return reply(200, batchView(id, true));
  return reply(404, { defined: true, code: "NOT_FOUND", message: "NOT_FOUND" });
}

/** `specBatch.submit` avec `skipConflicts` : la section déjà présente est écartée, le reste enregistré. */
export function submitReply(body: Record<string, unknown>, items: Held[]): Reply {
  const operations = (body.operations as Operation[] | undefined) ?? [];
  const owners = (body.skipConflicts as { proposals?: string[] } | undefined)?.proposals ?? [];
  const skipped = operations.flatMap((op, position) => {
    const specId = op.kind === "doc.section.create" ? `DOC-${slugOf(op.title ?? "")}` : null;
    const proposalId = owners[position];
    return specId === EXISTING_SECTION && proposalId
      ? [{ position, kind: op.kind, specId, reason: "exists", proposalId }]
      : [];
  });
  const returned = new Set(skipped.map((entry) => entry.proposalId));
  const ids = (body.proposalIds as string[] | undefined) ?? [];
  for (const item of items) {
    if (returned.has(item.id)) Object.assign(item, { status: "pending", appliedBatchId: null });
    else if (ids.includes(item.id)) item.appliedBatchId = RETRY_BATCH_ID;
  }
  return reply(200, batchView(RETRY_BATCH_ID, true, { skipped }));
}
