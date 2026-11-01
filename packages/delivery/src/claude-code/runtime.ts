/** Adaptateur Claude Code (sous-processus, sans shell) du port AgentRuntime. */
import { revealAgentCredential } from "../agent-credential.ts";
import { agentOutput } from "../agent-output.ts";
import { assertSessionRequest } from "../agent-request.ts";
import type {
  AgentRuntime,
  AgentRuntimeId,
  AgentSessionRequest,
  AgentSessionResult,
} from "../agent-runtime.ts";
import { buildClaudeArgv } from "./command.ts";
import { assertRuntimeConfig, DEFAULT_CLAUDE_EXECUTABLE } from "./config.ts";
import { buildChildEnv } from "./environment.ts";
import { toSessionResult } from "./outcome.ts";
import { runProcess, type SpawnSpec } from "./process.ts";
import { resolveWorktree } from "./worktree.ts";

export type { SpawnSpec } from "./process.ts";

export { DEFAULT_CLAUDE_EXECUTABLE };
/** Plafond dur de lecture brute = `maxOutputChars` x ce facteur ; au-delà, le groupe est tué. */
export const HARD_OUTPUT_FACTOR = 20;
export const DEFAULT_KILL_GRACE_MS = 5_000;

export interface ClaudeCodeRuntimeOptions {
  /** Chemin absolu du binaire, ou `claude` nu résolu par un PATH absolu, SANS shell (défaut `claude`). */
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
  readonly #options: ClaudeCodeRuntimeOptions;

  constructor(options: ClaudeCodeRuntimeOptions) {
    assertRuntimeConfig(options);
    this.#options = options;
  }

  async launchSession(request: AgentSessionRequest): Promise<AgentSessionResult> {
    const checked = assertSessionRequest(request);
    if (checked.signal.aborted) {
      return { status: "aborted", output: agentOutput("") };
    }
    const cwd = await resolveWorktree(checked.worktree, this.#options.allowedRoots);
    if (checked.signal.aborted) {
      return { status: "aborted", output: agentOutput("") };
    }
    return this.#run(checked, cwd);
  }

  async #run(request: AgentSessionRequest, cwd: string): Promise<AgentSessionResult> {
    const options = this.#options;
    const { credential, budget } = request;
    const spec = (options.wrapCommand ?? ((plain) => plain))({
      command: options.executable ?? DEFAULT_CLAUDE_EXECUTABLE,
      args: buildClaudeArgv(request),
    });
    const startedAt = Date.now();
    const outcome = await runProcess(spec, {
      cwd,
      env: buildChildEnv(options.parentEnv ?? process.env, {
        ...(credential === undefined ? {} : { credential }),
        ...(options.extraEnv === undefined ? {} : { extraEnv: options.extraEnv }),
      }),
      stdin: request.prompt.user,
      signal: request.signal,
      timeoutMs: budget.timeoutMs,
      killGraceMs: options.killGraceMs ?? DEFAULT_KILL_GRACE_MS,
      hardOutputBytes: budget.maxOutputChars * HARD_OUTPUT_FACTOR,
    });
    return toSessionResult(outcome, {
      maxOutputChars: budget.maxOutputChars,
      knownSecrets: credential === undefined ? [] : [revealAgentCredential(credential)],
      durationMs: Date.now() - startedAt,
    });
  }
}
