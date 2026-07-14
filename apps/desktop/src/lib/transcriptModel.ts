/**
 * Pure presentation logic for the Transcript view (US-018, roadmap P2 §4) — no
 * React, no Tauri, fully unit-testable. The screen (`screens/Transcript.tsx`) is a
 * thin shell that loads history, subscribes to live lines, and renders one DS
 * component per render type; all classification, replay/merge, auto-scroll, and
 * projection logic lives here (clean-architecture §1).
 */
import type { ActionState, CodeLine } from "@koklo/ui";
import type { KokloClient, TranscriptKind, TranscriptLineDto } from "@koklo/trpc-client";

/** Only the slice of the client the screen needs — keeps tests trivial to mock. */
export type TranscriptClient = Pick<KokloClient, "transcript" | "gates">;

/**
 * The four render buckets the transcript distinguishes visually (AC#1), plus
 * `meta` for lifecycle/usage lines that feed the header rather than a bubble.
 *   - `llm`    → MessageBubble
 *   - `shell`  → CodeBlock (command)
 *   - `output` → CodeBlock (result)
 *   - `gate`   → AiActionCard (read-only here; approval is US-019)
 */
export type RenderType = "llm" | "shell" | "output" | "gate" | "meta";

const RENDER_TYPE_BY_KIND: Record<TranscriptKind, RenderType> = {
  message: "llm",
  message_delta: "llm",
  reasoning: "llm",
  plan: "llm",
  user_input_request: "gate",
  user_input_response: "llm",
  approval_request: "gate",
  approval_decision: "gate",
  command: "shell",
  tool_call: "output",
  tool_result: "output",
  file_change: "output",
  usage: "meta",
  phase_lifecycle: "meta",
  session_lifecycle: "meta",
};

/** Map a transcript line to its render bucket (AC#1). */
export function renderTypeOf(line: TranscriptLineDto): RenderType {
  return RENDER_TYPE_BY_KIND[line.kind] ?? "output";
}

/** A user-authored line (input) renders as a user bubble; everything else as assistant. */
export function messageRole(line: TranscriptLineDto): "user" | "assistant" {
  if (line.source === "user" || line.kind === "user_input_response") return "user";
  return "assistant";
}

/** A `message_delta` that is not yet finalized — drives the TypingIndicator (streaming tail). */
export function isStreaming(line: TranscriptLineDto): boolean {
  return line.kind === "message_delta" && line.status !== "completed" && line.status !== "final";
}

/**
 * Pull display text from a line's structured payload, defensively (payload is
 * `unknown` over the wire). Falls back to `summary` when no richer text exists.
 */
export function lineText(line: TranscriptLineDto): string {
  const p = line.payload;
  if (typeof p === "string") return p;
  if (p && typeof p === "object") {
    const rec = p as Record<string, unknown>;
    for (const key of ["text", "output", "content", "command", "stdout"]) {
      const v = rec[key];
      if (typeof v === "string") return v;
    }
  }
  return line.summary;
}

/** Split a line's text into `CodeBlock` rows (shell/output rendering). */
export function toCodeLines(line: TranscriptLineDto): CodeLine[] {
  const text = lineText(line);
  const rows = text.split("\n");
  // Drop a single trailing empty row from a terminal newline, but keep real blanks.
  if (rows.length > 1 && rows[rows.length - 1] === "") rows.pop();
  return rows.map((content) => ({ content }));
}

/** Largest `seq` across a (possibly empty) set of lines — the replay cursor. */
export function maxSeq(lines: readonly TranscriptLineDto[]): number {
  return lines.reduce((max, l) => (l.seq > max ? l.seq : max), 0);
}

/**
 * Insert a line into an existing list idempotently, keyed by `id` (the stable
 * identity a line keeps across its live emit and its later persisted form). A line
 * already present is replaced in place (e.g. a streaming delta finalizing) — never
 * duplicated, which is what makes a window reload safe (AC#2).
 *
 * Ordering: persisted lines carry a real monotonic `seq` and insert in `seq` order;
 * **live** lines arrive with `seq === 0` (the bridge's "pre-cursor" sentinel) and are
 * appended at the tail, since they are by definition the newest lines. On reload the
 * history re-list brings the same lines back with authoritative seqs, deduped by `id`.
 */
export function mergeLine(
  lines: readonly TranscriptLineDto[],
  incoming: TranscriptLineDto,
): TranscriptLineDto[] {
  const existingIdx = lines.findIndex((l) => l.id === incoming.id);
  if (existingIdx !== -1) {
    const next = lines.slice();
    next[existingIdx] = incoming;
    return next;
  }
  // Live sentinel (seq 0) → append. Persisted line → insert among other real-seq lines.
  if (incoming.seq > 0) {
    const insertAt = lines.findIndex((l) => l.seq > incoming.seq);
    if (insertAt !== -1) return [...lines.slice(0, insertAt), incoming, ...lines.slice(insertAt)];
  }
  return [...lines, incoming];
}

/** Latest non-null phase across the lines — drives the header phase chip (roadmap §4). */
export function latestPhase(lines: readonly TranscriptLineDto[]): string | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].phase) return lines[i].phase;
  }
  return null;
}

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  costUsd: number | null;
}

/**
 * Roll up token/cost usage from `usage` lines for the header meter (roadmap §4).
 * Uses the most recent `usage` line's running totals when present, else sums.
 */
export function latestUsage(lines: readonly TranscriptLineDto[]): UsageTotals | null {
  const usage = lines.filter((l) => l.kind === "usage");
  if (usage.length === 0) return null;
  const last = usage[usage.length - 1].payload as Record<string, unknown> | null;
  // The runtime persists snake_case totals; older lines used camelCase.
  const num = (...values: unknown[]): number => {
    const found = values.find((v) => typeof v === "number");
    return typeof found === "number" ? found : 0;
  };
  const rawCost = [last?.costUsd, last?.cost_usd, last?.cost].find((v) => typeof v === "number");
  return {
    promptTokens: num(last?.promptTokens, last?.prompt_tokens),
    completionTokens: num(last?.completionTokens, last?.completion_tokens),
    costUsd: typeof rawCost === "number" ? rawCost : null,
  };
}

/**
 * Whether the scroll container is pinned near the bottom. Used to auto-disengage
 * "follow" when the user scrolls up to read, and re-engage when they return to the
 * bottom — the mechanism behind the pausable auto-scroll (AC#3).
 */
export function isNearBottom(
  metrics: { scrollTop: number; scrollHeight: number; clientHeight: number },
  threshold = 48,
): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold;
}

/**
 * Load history first, then subscribe to live lines (AC#2: replay before stream).
 * Returns the historical lines plus the unlisten handle. The caller seeds state with
 * `history`, then `onLine` delivers only lines newer than the replay cursor, so a
 * window reload re-paints from SQLite without losing or double-counting events.
 */
export async function loadAndSubscribe(
  client: TranscriptClient,
  sessionId: string,
  onLine: (line: TranscriptLineDto) => void,
): Promise<{ history: TranscriptLineDto[]; unlisten: () => void }> {
  const history = await client.transcript.list({ sessionId });
  const unlisten = await client.transcript.subscribe({ sessionId }, onLine);
  return { history, unlisten };
}

function gateActionOf(line: TranscriptLineDto): string | null {
  const payload = line.payload;
  if (!payload || typeof payload !== "object") return null;
  const action = (payload as Record<string, unknown>).action;
  return typeof action === "string" ? action : null;
}

/**
 * Stable identity of a gate request/decision line. Provider gates carry the
 * provider `request_id` in `itemKey`; orchestrator phase gates historically
 * persisted no item_key, so they fall back to a phase-scoped key — a phase
 * blocks at most one gate at a time, so the phase is a sufficient identity.
 */
export function gateRequestKey(line: TranscriptLineDto): string | null {
  return line.itemKey ?? (line.phase ? `phase:${line.phase}` : null);
}

export function gateResolutionByRequestId(
  lines: readonly TranscriptLineDto[],
): ReadonlyMap<string, "approve" | "reject" | "edit"> {
  const resolved = new Map<string, "approve" | "reject" | "edit">();
  for (const line of lines) {
    if (line.kind !== "approval_decision") continue;
    const key = gateRequestKey(line);
    if (!key) continue;
    const action = gateActionOf(line);
    if (action === "approve" || action === "reject" || action === "edit") {
      resolved.set(key, action);
    }
  }
  return resolved;
}

export function gateActionState(
  line: TranscriptLineDto,
  resolved: ReadonlyMap<string, "approve" | "reject" | "edit">,
  optimisticResolvedIds: ReadonlySet<string>,
): ActionState {
  if (line.kind === "approval_decision") {
    return gateActionOf(line) === "reject" ? "rejected" : "applied";
  }
  if (line.kind !== "approval_request") return "pending";
  const key = gateRequestKey(line);
  if (!key) return "pending";
  if (optimisticResolvedIds.has(key)) return "applied";
  const decision = resolved.get(key);
  if (decision === "reject") return "rejected";
  if (decision) return "applied";
  return "pending";
}

export function canDecideGate(
  line: TranscriptLineDto,
  resolved: ReadonlyMap<string, "approve" | "reject" | "edit">,
  optimisticResolvedIds: ReadonlySet<string>,
): boolean {
  return (
    line.kind === "approval_request" &&
    gateRequestKey(line) !== null &&
    gateActionState(line, resolved, optimisticResolvedIds) === "pending"
  );
}
