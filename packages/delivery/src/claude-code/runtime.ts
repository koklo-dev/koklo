/** Adaptateur Claude Code (sous-processus, sans shell) du port AgentRuntime (squelette 73c). */
import type {
  AgentRuntime,
  AgentRuntimeId,
  AgentSessionRequest,
  AgentSessionResult,
} from "../index.ts";

export const DEFAULT_CLAUDE_EXECUTABLE = "claude";
/** Plafond dur de lecture brute = `maxOutputChars` x ce facteur ; au-delà, le groupe est tué. */
export const HARD_OUTPUT_FACTOR = 20;
export const DEFAULT_KILL_GRACE_MS = 5_000;

export interface SpawnSpec {
  readonly command: string;
  readonly args: readonly string[];
}

export interface ClaudeCodeRuntimeOptions {
  /** Binaire résolu SANS shell (défaut `claude`). */
  readonly executable?: string;
  /** Racines autorisées pour les worktrees (comparées après `realpath`). */
  readonly allowedRoots: readonly string[];
  /** Environnement parent dont seule la liste blanche est lue (défaut `process.env`). */
  readonly parentEnv?: Readonly<Record<string, string | undefined>>;
  /** Variables explicites ajoutées au fils (opaques, jamais journalisées). */
  readonly extraEnv?: Readonly<Record<string, string>>;
  /** Délai entre SIGTERM et SIGKILL du groupe (défaut 5 s). */
  readonly killGraceMs?: number;
  /** Crochet pour un futur bac à sable (bwrap, conteneur) ; identité par défaut. */
  readonly wrapCommand?: (spec: SpawnSpec) => SpawnSpec;
}

export class ClaudeCodeRuntime implements AgentRuntime {
  readonly id: AgentRuntimeId = "claude-code";

  constructor(_options: ClaudeCodeRuntimeOptions) {}

  launchSession(_request: AgentSessionRequest): Promise<AgentSessionResult> {
    return Promise.reject(new Error("not implemented: lot 73c Green"));
  }
}
