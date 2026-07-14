import { createKokloClient, type KokloClient } from "@koklo/trpc-client";
import type {
  AccountDto,
  AccountInput,
  ProviderDto,
  SessionDto,
  TranscriptLineDto,
  WorktreeDto,
} from "@koklo/trpc-client";

export const BROWSER_CLIENT_STATE_KEY = "koklo.browserClientState.v1";

interface BrowserClientState {
  account: AccountDto | null;
  sessions: SessionDto[];
  transcripts: Record<string, TranscriptLineDto[]>;
}

type BrowserStorage = Pick<Storage, "getItem" | "setItem">;

function isoNow(): string {
  return new Date().toISOString();
}

function browserRuntimeAccount(): AccountDto {
  return {
    name: "Koklo Demo",
    email: "demo@koklo.dev",
    role: "Product lead",
    createdAt: 1_720_368_000,
  };
}

function browserRuntimeSessions(): SessionDto[] {
  return [
    {
      id: "session-browser-1",
      title: "Desktop shell smoke coverage",
      status: "running",
      preset: "light",
      projectPath: "/workspace/koklo",
      workspacePath: "/workspace/koklo/.koklo/worktrees/session-browser-1",
      workspaceBranch: "koklo/session/session-browser-1",
      createdAt: "2026-07-14T08:30:00Z",
      updatedAt: "2026-07-14T08:32:00Z",
    },
    {
      id: "session-browser-2",
      title: "Transcript approval polish",
      status: "completed",
      preset: "sdd",
      projectPath: "/workspace/koklo",
      workspacePath: "/workspace/koklo/.koklo/worktrees/session-browser-2",
      workspaceBranch: "koklo/session/session-browser-2",
      createdAt: "2026-07-14T07:45:00Z",
      updatedAt: "2026-07-14T08:10:00Z",
    },
  ];
}

function browserRuntimeTranscripts(): Record<string, TranscriptLineDto[]> {
  return {
    "session-browser-1": [
      {
        id: "browser-line-1",
        sessionId: "session-browser-1",
        seq: 1,
        phase: "developer",
        agentName: "developer",
        source: "llm",
        kind: "message",
        status: "completed",
        itemKey: null,
        summary: "Session started",
        payload: { text: "Reviewing the shell entry points and smoke harness." },
        createdAt: "2026-07-14T08:30:10Z",
      },
      {
        id: "browser-line-2",
        sessionId: "session-browser-1",
        seq: 2,
        phase: "developer",
        agentName: "developer",
        source: "shell",
        kind: "command",
        status: "completed",
        itemKey: null,
        summary: "pnpm run lint",
        payload: { text: "pnpm run lint" },
        createdAt: "2026-07-14T08:31:10Z",
      },
    ],
    "session-browser-2": [
      {
        id: "browser-line-3",
        sessionId: "session-browser-2",
        seq: 1,
        phase: "qa-reviewer",
        agentName: "qa-reviewer",
        source: "llm",
        kind: "message",
        status: "completed",
        itemKey: null,
        summary: "Approved",
        payload: { text: "Smoke coverage reviewed and accepted." },
        createdAt: "2026-07-14T08:05:00Z",
      },
    ],
  };
}

function defaultState(): BrowserClientState {
  return {
    account: browserRuntimeAccount(),
    sessions: browserRuntimeSessions(),
    transcripts: browserRuntimeTranscripts(),
  };
}

function readState(storage: BrowserStorage): BrowserClientState {
  const raw = storage.getItem(BROWSER_CLIENT_STATE_KEY);
  if (!raw) return defaultState();
  try {
    return JSON.parse(raw) as BrowserClientState;
  } catch {
    return defaultState();
  }
}

function writeState(storage: BrowserStorage, state: BrowserClientState): void {
  storage.setItem(BROWSER_CLIENT_STATE_KEY, JSON.stringify(state));
}

function makeSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}`;
}

function workspacePath(projectPath: string, sessionId: string): string {
  return `${projectPath.replace(/\/$/, "")}/.koklo/worktrees/${sessionId}`;
}

function toWorktrees(sessions: SessionDto[]): WorktreeDto[] {
  return sessions.map((session, index) => ({
    sessionId: session.id,
    path: session.workspacePath,
    branch: session.workspaceBranch,
    isActive: index === 0,
    status: session.status,
  }));
}

export function hasTauriRuntime(): boolean {
  return Boolean((globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export function createBrowserClient(
  storage: BrowserStorage = window.localStorage,
): KokloClient {
  const providers: ProviderDto[] = [
    {
      name: "browser-demo",
      interactionMode: "synthetic",
      detected: true,
      detectionSource: "browser",
    },
  ];

  return createKokloClient({
    invokeFn: async (command, args) => {
      const state = readState(storage);

      switch (command) {
        case "account_get":
          return state.account;
        case "account_save": {
          const input = args as unknown as AccountInput;
          const account: AccountDto = {
            name: input.name,
            email: input.email,
            role: input.role ?? null,
            createdAt: Math.floor(Date.now() / 1000),
          };
          writeState(storage, { ...state, account });
          return account;
        }
        case "sessions_list":
          return state.sessions;
        case "sessions_list_for_project":
          return state.sessions.filter((session) => session.projectPath === args?.projectPath);
        case "sessions_get":
          return state.sessions.find((session) => session.id === args?.id) ?? null;
        case "sessions_run": {
          const sessionId = makeSessionId();
          const now = isoNow();
          const projectPath = String(args?.projectPath ?? "/workspace/koklo");
          const session: SessionDto = {
            id: sessionId,
            title: String(args?.title ?? "New run"),
            status: "queued",
            preset: String(args?.preset ?? "light"),
            projectPath,
            workspacePath: workspacePath(projectPath, sessionId),
            workspaceBranch: `koklo/session/${sessionId}`,
            createdAt: now,
            updatedAt: now,
          };
          writeState(storage, {
            ...state,
            sessions: [session, ...state.sessions],
            transcripts: {
              ...state.transcripts,
              [sessionId]: [],
            },
          });
          return session;
        }
        case "sessions_usage":
          return {
            sessionId: String(args?.sessionId ?? ""),
            promptTokens: 320,
            completionTokens: 148,
            costUsd: 0,
          };
        case "transcript_list":
          return state.transcripts[String(args?.sessionId ?? "")] ?? [];
        case "transcript_since": {
          const sessionId = String(args?.sessionId ?? "");
          const sinceSeq = Number(args?.sinceSeq ?? 0);
          return (state.transcripts[sessionId] ?? []).filter((line) => line.seq > sinceSeq);
        }
        case "gates_pending":
          return [];
        case "gates_decide":
          return undefined;
        case "providers_list":
          return providers;
        case "providers_detect":
          return providers[0] ?? null;
        case "worktrees_list":
          return toWorktrees(state.sessions);
        case "worktrees_create": {
          const sessionId = String(args?.sessionId ?? "");
          const session = state.sessions.find((item) => item.id === sessionId);
          if (!session) {
            throw new Error(`Unknown session: ${sessionId}`);
          }
          return toWorktrees([session])[0];
        }
        case "worktrees_prune":
        case "worktrees_switch":
          return undefined;
        default:
          throw new Error(`Unsupported browser IPC command: ${command}`);
      }
    },
    listenFn: async () => async () => undefined,
  });
}
