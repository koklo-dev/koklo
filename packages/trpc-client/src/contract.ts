/**
 * Koklo desktop IPC contract — the single source of truth for the Tauri ⇄ frontend
 * boundary (Sprint 006 / US-013, roadmap P2 §1 "tRPC IPC Bridge").
 *
 * This file is **types + names only**. It carries zero business logic: every
 * procedure resolves, on the Rust side, to a thin adapter over a `koklo-*` crate
 * (storage / providers / git-engine). Frontend screens code against `KokloContract`;
 * the runtime invoke client (US-014) implements it via `@tauri-apps/api`.
 *
 * DTOs are derived from what the existing `koklo-storybook` screens actually
 * consume (see workflow run 02-designer), and mirror the Rust domain types:
 *   - `SessionDto`        ← `koklo_storage::Session`
 *   - `TranscriptLineDto` ← `koklo_storage::TranscriptItemRecord` / `TranscriptItemKind`
 *   - `GateDto`           ← `koklo_providers::{ProviderApprovalKind, ProviderApprovalDecision}`
 *   - `ProviderDto`       ← provider registry + `ProviderInteractionMode` + `ProviderDetection`
 *   - `WorktreeDto`       ← `Session.workspace_path` / `workspace_branch` (the `koklo/session/<uuid>` worktree)
 */

/** Bump when the wire shape changes incompatibly (mirrors `ProviderEvent::CONTRACT_VERSION`). */
export const IPC_CONTRACT_VERSION = "koklo.ipc.v1";

// ---------------------------------------------------------------------------
// DTOs (wire shapes — camelCase, JSON-serializable)
// ---------------------------------------------------------------------------

/** A pipeline session row. Drives ProjectHome / Sidebar conversation list. */
export interface SessionDto {
  id: string;
  /** `Session.feature_title` on the Rust side. */
  title: string;
  status: string;
  preset: string;
  projectPath: string;
  /** Isolated session workspace — the worktree path. Falls back to `projectPath`. */
  workspacePath: string;
  /** Dedicated `koklo/session/<uuid>` branch when git isolation is available. */
  workspaceBranch: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionInput {
  featureTitle: string;
  preset: string;
  projectPath: string;
}

/**
 * Discriminant mirroring `koklo_events::TranscriptItemKind`, in the exact
 * snake_case form persisted by storage (`enum_label`), so the Rust IPC adapter
 * is a pure pass-through with no re-casing logic.
 */
export type TranscriptKind =
  | "message"
  | "message_delta"
  | "tool_call"
  | "tool_result"
  | "reasoning"
  | "plan"
  | "command"
  | "file_change"
  | "approval_request"
  | "approval_decision"
  | "user_input_request"
  | "user_input_response"
  | "usage"
  | "phase_lifecycle"
  | "session_lifecycle";

/**
 * One typed transcript line. Screens (MainChat) switch rendering on `kind`:
 * `message` → MessageBubble, `file_change` → AiActionCard, `command` → shell card, etc.
 * `payload` is the kind-specific structured body (e.g. file diff, command output).
 */
export interface TranscriptLineDto {
  id: string;
  sessionId: string;
  /** Monotonic per-session sequence — the cursor for incremental fetch / replay. */
  seq: number;
  phase: string | null;
  agentName: string | null;
  /** Origin tag: `"llm"` | `"shell"` | `"system"` | `"user"` … (from `TranscriptItemRecord.source`). */
  source: string;
  kind: TranscriptKind;
  status: string;
  itemKey: string | null;
  summary: string;
  payload: unknown | null;
  createdAt: string;
}

/** Kind of approval a gate is asking for (← `ProviderApprovalKind`, snake_case wire form). */
export type GateKind = "command_execution" | "file_change" | "permissions" | "patch_apply";

/** Reviewer decision (← `ProviderApprovalDecision`). */
export type GateDecision = "approve" | "reject" | "edit";

/** A pending human gate. Drives the AiActionCard approve/reject affordance. */
export interface GateDto {
  sessionId: string;
  phase: string;
  kind: GateKind;
  description: string;
  /** Correlates the decision back to the live provider session. */
  requestId: string | null;
  details: unknown | null;
}

export interface GateDecisionInput {
  sessionId: string;
  action: GateDecision;
  note?: string;
  /** Only meaningful when `action === "edit"`. */
  editPath?: string;
}

/** How much of the interactive contract a provider implements (← `ProviderInteractionMode`). */
export type ProviderInteractionMode = "native" | "normalized" | "synthetic";

/** A provider entry for the Settings → AI Accounts panel. */
export interface ProviderDto {
  name: string;
  interactionMode: ProviderInteractionMode;
  detected: boolean;
  /** Where detection came from (env, cli, config…) when `detected`. */
  detectionSource: string | null;
}

/** Usage roll-up for a session (token meter / cost). */
export interface UsageSummaryDto {
  sessionId: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number | null;
}

/**
 * A session worktree. Read state is derived from `Session.workspace_path`/`workspace_branch`
 * today; `create`/`prune`/`switch` are contract-declared but engine-backed in a later sprint
 * (git-engine has branch ops, no worktree ops yet — see backlog "P2 — Design system & worktrees").
 */
export interface WorktreeDto {
  sessionId: string;
  path: string;
  branch: string;
  isActive: boolean;
  status: string;
}

// ---------------------------------------------------------------------------
// Procedure surface
// ---------------------------------------------------------------------------

/** Request/response procedure. Phantom generics give the client end-to-end typing. */
export interface ProcedureDef<TInput, TOutput> {
  readonly command: string;
  /** @internal phantom — never present at runtime. */
  readonly _input?: TInput;
  /** @internal phantom — never present at runtime. */
  readonly _output?: TOutput;
}

/** A push stream the client subscribes to over a Tauri event channel. */
export interface SubscriptionDef<TInput, TEvent> {
  readonly event: string;
  readonly _input?: TInput;
  readonly _event?: TEvent;
}

export type InferInput<T> = T extends ProcedureDef<infer I, unknown>
  ? I
  : T extends SubscriptionDef<infer I, unknown>
    ? I
    : never;
export type InferOutput<T> = T extends ProcedureDef<unknown, infer O> ? O : never;
export type InferEvent<T> = T extends SubscriptionDef<unknown, infer E> ? E : never;

/**
 * The full IPC contract. Each leaf names the Tauri command (or event) it binds to.
 * Command names are `<namespace>.<method>` so Rust and TS share one string.
 */
export interface KokloContract {
  sessions: {
    list: ProcedureDef<void, SessionDto[]>;
    listForProject: ProcedureDef<{ projectPath: string }, SessionDto[]>;
    get: ProcedureDef<{ id: string }, SessionDto | null>;
    create: ProcedureDef<CreateSessionInput, SessionDto>;
    updateStatus: ProcedureDef<{ id: string; status: string }, void>;
    usage: ProcedureDef<{ sessionId: string }, UsageSummaryDto>;
  };
  transcript: {
    list: ProcedureDef<{ sessionId: string }, TranscriptLineDto[]>;
    /** Incremental fetch: everything with `seq > sinceSeq`. */
    since: ProcedureDef<{ sessionId: string; sinceSeq: number }, TranscriptLineDto[]>;
    /** Live tail of new transcript lines for a session. */
    subscribe: SubscriptionDef<{ sessionId: string }, TranscriptLineDto>;
  };
  gates: {
    pending: ProcedureDef<{ sessionId: string }, GateDto[]>;
    decide: ProcedureDef<GateDecisionInput, void>;
  };
  providers: {
    list: ProcedureDef<void, ProviderDto[]>;
    detect: ProcedureDef<void, ProviderDto | null>;
  };
  worktrees: {
    list: ProcedureDef<void, WorktreeDto[]>;
    create: ProcedureDef<{ sessionId: string }, WorktreeDto>;
    prune: ProcedureDef<{ path: string }, void>;
    switch: ProcedureDef<{ path: string }, void>;
  };
}

/**
 * Runtime registry of command / event names — the names the Rust `#[tauri::command]`
 * handlers register under. The invoke client (US-014) reads `command`/`event` from here,
 * so adding a procedure in one place keeps client and backend in lock-step.
 */
export const contract = {
  sessions: {
    list: { command: "sessions.list" },
    listForProject: { command: "sessions.listForProject" },
    get: { command: "sessions.get" },
    create: { command: "sessions.create" },
    updateStatus: { command: "sessions.updateStatus" },
    usage: { command: "sessions.usage" },
  },
  transcript: {
    list: { command: "transcript.list" },
    since: { command: "transcript.since" },
    subscribe: { event: "transcript.subscribe" },
  },
  gates: {
    pending: { command: "gates.pending" },
    decide: { command: "gates.decide" },
  },
  providers: {
    list: { command: "providers.list" },
    detect: { command: "providers.detect" },
  },
  worktrees: {
    list: { command: "worktrees.list" },
    create: { command: "worktrees.create" },
    prune: { command: "worktrees.prune" },
    switch: { command: "worktrees.switch" },
  },
} as const satisfies KokloContract;
