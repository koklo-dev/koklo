/** Aides des tests de l'adaptateur : faux executable `claude`, repertoires jetables, sondes de processus. */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, vi } from "vitest";
import { ClaudeCodeRuntime, type ClaudeCodeRuntimeOptions } from "../../src/claude-code/index.ts";
import type { AgentSessionRequest, AgentSessionResult } from "../../src/index.ts";

export const FAKE_CLAUDE = resolve(import.meta.dirname, "../fixtures/fake-claude.mjs");

export interface Scenario {
  readonly scenario: string;
  readonly text?: string;
  readonly channel?: "stderr" | "result";
  readonly size?: number;
  /** Demarrage lent simule (runner charge) avant le scenario. */
  readonly startDelayMs?: number;
}

export interface Sandbox {
  /** Racine autorisee (realpath). */
  readonly root: string;
  /** Worktree reel sous `root`. */
  readonly worktree: string;
  /** Dossier de traces du faux executable. */
  readonly traces: string;
}

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

export const makeSandbox = (): Sandbox => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "koklo-cc-")));
  made.push(root);
  const worktree = join(root, "worktrees", "tk-73");
  const traces = join(root, "traces");
  mkdirSync(worktree, { recursive: true });
  mkdirSync(traces);
  return { root: join(root, "worktrees"), worktree, traces };
};

export const script = (sandbox: Sandbox, scenario: Scenario): void =>
  writeFileSync(join(sandbox.traces, "scenario.json"), JSON.stringify(scenario));

export const PARENT_ENV: Readonly<Record<string, string | undefined>> = {
  PATH: process.env.PATH,
  HOME: "/home/fake-runner",
  LANG: "fr_FR.UTF-8",
  GITHUB_TOKEN: "ghp_PARENTGITHUBTOKEN0123456789abcdef",
  DATABASE_URL: "postgres://koklo:PARENT-DB-PASSWORD@db/koklo",
  KOKLO_BYOK_KEY: "sk-ant-PARENT-BYOK-0123456789",
  ANTHROPIC_API_KEY: "sk-ant-PARENT-ANTHROPIC-0123456789",
  CLAUDE_CODE_USE_BEDROCK: "1",
  UNKNOWN_VARIABLE: "should-not-pass",
};

export const makeRuntime = (
  sandbox: Sandbox,
  overrides: Partial<ClaudeCodeRuntimeOptions> = {},
): ClaudeCodeRuntime =>
  new ClaudeCodeRuntime({
    executable: FAKE_CLAUDE,
    allowedRoots: [sandbox.root],
    parentEnv: PARENT_ENV,
    extraEnv: { FAKE_CLAUDE_DIR: sandbox.traces },
    killGraceMs: 200,
    ...overrides,
  });

const read = (sandbox: Sandbox, name: string): string =>
  readFileSync(join(sandbox.traces, name), "utf8");

export const recordedArgv = (sandbox: Sandbox): string[] =>
  JSON.parse(read(sandbox, "argv.json")) as string[];
export const recordedEnv = (sandbox: Sandbox): Record<string, string> =>
  JSON.parse(read(sandbox, "env.json")) as Record<string, string>;
export const recordedStdin = (sandbox: Sandbox): string => read(sandbox, "stdin.txt");
export const recordedCwd = (sandbox: Sandbox): string => read(sandbox, "cwd.txt");
export const recordedPid = (sandbox: Sandbox, name = "pid.txt"): number =>
  Number(read(sandbox, name));

export const launches = (sandbox: Sandbox): number => {
  try {
    return read(sandbox, "launches.log").split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
};

/** Vivant = existe et n'est pas un zombie (Linux : /proc/<pid>/stat). */
export const isAlive = (pid: number): boolean => {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3) !== "Z";
  } catch {
    return false;
  }
};

/** Attend (au plus 3 s) que `pid` soit mort ; rend l'etat final. */
export const waitDead = async (pid: number): Promise<boolean> => {
  for (let i = 0; i < 60 && isAlive(pid); i++) {
    await sleep(50);
  }
  return !isAlive(pid);
};

/** Attend activement (au plus 5 s) qu'un fichier de trace existe et soit non vide ; rend son pid. */
export const waitForPidFile = async (sandbox: Sandbox, name: string): Promise<number> => {
  for (let i = 0; i < 250; i++) {
    const file = join(sandbox.traces, name);
    if (existsSync(file) && readFileSync(file, "utf8") !== "") {
      return Number(readFileSync(file, "utf8"));
    }
    await sleep(20);
  }
  throw new Error(`${name} n'est jamais apparu`);
};

/** Tue un survivant lance par un test (jamais autre chose) et attend sa mort. */
export const killSurvivor = async (pid: number): Promise<void> => {
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // deja mort
  }
  await waitDead(pid);
};

/**
 * Lance une session dont le timeout part SEULEMENT une fois le fils pret (`ready.txt` : sa sortie
 * est ecrite). Les minuteurs de l'adaptateur sont simules ; l'attente, elle, est reelle : aucune
 * duree devinee, donc insensible a la charge du runner.
 */
export const launchTimedOut = async (
  runtime: ClaudeCodeRuntime,
  sandbox: Sandbox,
  request: AgentSessionRequest,
): Promise<AgentSessionResult> => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    let result: AgentSessionResult | undefined;
    const pending = runtime.launchSession(request).then((value) => {
      result = value;
    });
    await waitForPidFile(sandbox, "ready.txt");
    while (result === undefined) {
      vi.advanceTimersByTime(60_000);
      await sleep(20);
    }
    await pending;
    return result;
  } finally {
    vi.useRealTimers();
  }
};
