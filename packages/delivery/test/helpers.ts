import {
  applyEvent,
  type Run,
  type RunEvent,
  type RunLimits,
  type RunState,
} from "../src/index.ts";

/** Références écrites dans le test, indépendantes de l'implémentation (vision §10.3, annexe C §C.6). */
export const STATES: readonly RunState[] = [
  "leased",
  "developing",
  "local_gates",
  "pr_open",
  "ci_wait",
  "reviewing",
  "merge_requested",
  "merged",
  "deployed_staging",
  "blocked",
  "escalated",
];

export const EVENT_TYPES = [
  "worktree_ready",
  "dev_done",
  "gates_green",
  "gates_red",
  "pr_opened",
  "ci_green",
  "ci_red",
  "ci_timeout",
  "conflict_detected",
  "verdict_approve",
  "verdict_request_changes",
  "merge_done",
  "deploy_green",
  "block",
  "escalate",
  "quota_hit",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const TERMINAL_STATES: readonly RunState[] = ["deployed_staging", "escalated"];

/** Table de référence : état -> événement accepté -> état d'arrivée (payloads par défaut de `event`). */
export const REFERENCE: Readonly<Record<RunState, Readonly<Partial<Record<EventType, RunState>>>>> =
  {
    leased: { worktree_ready: "developing", block: "blocked", quota_hit: "leased" },
    developing: { dev_done: "local_gates", block: "blocked", quota_hit: "developing" },
    local_gates: {
      gates_green: "pr_open",
      gates_red: "developing",
      block: "blocked",
      quota_hit: "local_gates",
    },
    pr_open: { pr_opened: "ci_wait", block: "blocked", quota_hit: "pr_open" },
    ci_wait: {
      ci_green: "reviewing",
      ci_red: "developing",
      ci_timeout: "ci_wait",
      conflict_detected: "developing",
      block: "blocked",
      quota_hit: "ci_wait",
    },
    reviewing: {
      verdict_approve: "merge_requested",
      verdict_request_changes: "developing",
      block: "blocked",
      quota_hit: "reviewing",
    },
    merge_requested: { merge_done: "merged", block: "blocked", quota_hit: "merge_requested" },
    // Lot 2 : rejeux idempotents (merge_done sur merged, deploy_green sur deployed_staging, escalate sur escalated).
    merged: {
      merge_done: "merged",
      deploy_green: "deployed_staging",
      block: "blocked",
      quota_hit: "merged",
    },
    deployed_staging: { deploy_green: "deployed_staging" },
    blocked: { escalate: "escalated" },
    escalated: { escalate: "escalated" },
  };

export const NOMINAL_PATH: readonly RunState[] = [
  "leased",
  "developing",
  "local_gates",
  "pr_open",
  "ci_wait",
  "reviewing",
  "merge_requested",
  "merged",
  "deployed_staging",
];

export const LIMITS: RunLimits = { maxAttempts: 3, maxReviewRounds: 4, maxCiWaits: 3 };

export const SECRET_OUTPUT = "fatal: token ghp_SECRET0123456789 rejected";

/** Événement par défaut de chaque type (chemin sans garde déclenchée). */
export const event = (type: EventType): RunEvent => {
  switch (type) {
    case "worktree_ready":
      return { type, branch: "koklo/tk-72" };
    case "dev_done":
      return { type, diffEmpty: false, remoteBranchExists: false };
    case "pr_opened":
      return { type, pullRequest: "acme/app#12" };
    case "block":
      return { type, cause: "git_error", output: SECRET_OUTPUT };
    default:
      return { type };
  }
};

/** Run littéral à un état donné (sans passer par l'implémentation). */
export const runAt = (state: RunState, overrides: Partial<Run> = {}): Run => ({
  ticket: "TK-72",
  state,
  attempts: 0,
  reviewRounds: 0,
  ciWaits: 0,
  blocked:
    state === "blocked"
      ? { cause: "git_error", detail: { output: "fatal: not a git repo" } }
      : null,
  branch: null,
  pullRequest: null,
  lastReviewedAfterFix: false,
  version: 0,
  ...overrides,
});

/** Gèle récursivement une valeur (pour prouver l'absence de mutation). */
export const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

/** Joue des événements par défaut à la suite, en renvoyant le dernier run. */
export const play = (start: Run, types: readonly EventType[], limits: RunLimits = LIMITS): Run =>
  types.reduce((run, type) => applyEvent(run, event(type), limits).run, start);

/** De developing à reviewing : dev_done, gates_green, pr_opened, ci_green. */
export const TO_REVIEWING: readonly EventType[] = [
  "dev_done",
  "gates_green",
  "pr_opened",
  "ci_green",
];
/** De developing à ci_wait. */
export const TO_CI_WAIT: readonly EventType[] = ["dev_done", "gates_green", "pr_opened"];
