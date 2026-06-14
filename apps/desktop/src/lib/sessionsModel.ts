/**
 * Pure presentation logic for the Sessions screen — no React, no Tauri, fully
 * unit-testable. The screen (`screens/Sessions.tsx`) is a thin shell over these
 * helpers; business logic stays in the Rust backend (clean-architecture §1).
 */
import type { KokloClient, RunSessionInput, RunType, SessionDto } from "@koklo/trpc-client";
import type { SessionCardProps, SessionPreset, SessionStatus } from "@koklo/ui";

export const RUN_TYPES: readonly RunType[] = ["feature", "bug", "task"];
export const PRESETS: readonly SessionPreset[] = ["light", "sdd", "bmad", "speckit"];

/** Only the slice of the client this screen needs — keeps tests trivial to mock. */
export type SessionsClient = Pick<KokloClient, "sessions">;

/** Map a backend status string to a DS `SessionStatus`, tolerating synonyms. */
export function toSessionStatus(status: string): SessionStatus {
  switch (status.toLowerCase()) {
    case "running":
    case "in_progress":
      return "running";
    case "queued":
    case "pending":
      return "queued";
    case "completed":
    case "done":
      return "done";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "queued";
  }
}

/** Coerce an arbitrary backend preset string to a known `SessionPreset`. */
export function toPreset(preset: string): SessionPreset {
  return (PRESETS as readonly string[]).includes(preset) ? (preset as SessionPreset) : "light";
}

/** Deterministic `DD Mon HH:mm` (UTC) — avoids locale/timezone flakiness. */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())} ${months[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export type SessionCardModel = SessionCardProps & { id: string };

/**
 * Project a `SessionDto` onto `SessionCard` props. Surfaces the session worktree:
 * the isolated `workspacePath` (when it differs from the project root) takes
 * precedence, otherwise the dedicated `workspaceBranch` is shown.
 */
export function toCardProps(dto: SessionDto): SessionCardModel {
  const hasWorktree = Boolean(dto.workspacePath) && dto.workspacePath !== dto.projectPath;
  return {
    id: dto.id,
    title: dto.title,
    preset: toPreset(dto.preset),
    status: toSessionStatus(dto.status),
    updatedAt: formatTimestamp(dto.updatedAt),
    createdAt: formatTimestamp(dto.createdAt),
    worktreePath: hasWorktree ? dto.workspacePath : undefined,
    branch: dto.workspaceBranch || undefined,
  };
}

export interface RunForm {
  type: RunType;
  title: string;
  preset: SessionPreset;
}

/**
 * Validate the New Run form and start the run through the real `sessions.run`
 * IPC procedure (US-017-A backend). Throws a user-actionable error on invalid
 * input; the trimmed title is what reaches the backend.
 */
export async function submitRun(
  client: SessionsClient,
  form: RunForm,
  projectPath: string,
): Promise<SessionDto> {
  const title = form.title.trim();
  if (!title) throw new Error("Title is required to start a run.");
  const input: RunSessionInput = { type: form.type, title, preset: form.preset, projectPath };
  return client.sessions.run(input);
}
