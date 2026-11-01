/** Sous-processus du CLI : sans shell, groupe de processus dédié, mise à mort SIGTERM puis SIGKILL. */
import { type ChildProcess, spawn } from "node:child_process";
import { AgentRuntimeUnavailableError } from "../agent-errors.ts";
import { createStreamReader, type StreamState } from "./stream.ts";

export interface SpawnSpec {
  readonly command: string;
  readonly args: readonly string[];
}

export interface ProcessOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly stdin: string;
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
  readonly killGraceMs: number;
  /** Octets bruts (stdout + stderr) au-delà desquels le groupe est tué. */
  readonly hardOutputBytes: number;
}

export type StopReason = "timeout" | "aborted" | "exceeded";

export interface ProcessOutcome {
  /** Raison de la mise à mort demandée par l'adaptateur ; absente si le fils s'est arrêté seul. */
  readonly stopped?: StopReason;
  readonly exitCode: number | null;
  readonly stream: StreamState;
  readonly stderr: string;
}

/** Signale le groupe entier (`-pid`), petit-fils compris ; un groupe déjà mort n'est pas une erreur. */
const signalGroup = (pid: number | undefined, signal: NodeJS.Signals): void => {
  if (pid === undefined) {
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    // ESRCH : plus aucun membre.
  }
};

const unavailable = (): AgentRuntimeUnavailableError =>
  new AgentRuntimeUnavailableError({ operation: "spawn", runtime: "claude-code" });

const launch = (spec: SpawnSpec, options: ProcessOptions): ChildProcess =>
  spawn(spec.command, [...spec.args], {
    cwd: options.cwd,
    env: { ...options.env },
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
    shell: false,
  });

interface Collector {
  readonly reader: ReturnType<typeof createStreamReader>;
  stderr(): string;
}

/** Branche la lecture de stdout/stderr ; `onOverflow` est appelé au dépassement du plafond dur. */
const collect = (child: ChildProcess, hardBytes: number, onOverflow: () => void): Collector => {
  const reader = createStreamReader();
  let stderr = "";
  let bytes = 0;
  let overflowed = false;
  const accept = (chunk: string): boolean => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > hardBytes && !overflowed) {
      overflowed = true;
      onOverflow();
    }
    return !overflowed;
  };
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => accept(chunk) && reader.push(chunk));
  child.stderr?.on("data", (chunk: string) => {
    stderr = accept(chunk) ? stderr + chunk : stderr;
  });
  return { reader, stderr: () => stderr };
};

interface Stopper {
  readonly reason: () => StopReason | undefined;
  readonly stop: (reason: StopReason) => void;
  readonly dispose: () => void;
}

/** Première raison gagnante : SIGTERM au groupe, puis SIGKILL après le délai de grâce. */
const createStopper = (child: ChildProcess, options: ProcessOptions): Stopper => {
  let reason: StopReason | undefined;
  const timers: NodeJS.Timeout[] = [];
  const stop = (why: StopReason): void => {
    if (reason !== undefined) {
      return;
    }
    reason = why;
    signalGroup(child.pid, "SIGTERM");
    timers.push(setTimeout(() => signalGroup(child.pid, "SIGKILL"), options.killGraceMs));
  };
  const onAbort = (): void => stop("aborted");
  timers.push(setTimeout(() => stop("timeout"), options.timeoutMs));
  options.signal.addEventListener("abort", onAbort, { once: true });
  if (options.signal.aborted) {
    onAbort();
  }
  return {
    reason: () => reason,
    stop,
    dispose: () => {
      options.signal.removeEventListener("abort", onAbort);
      for (const timer of timers) {
        clearTimeout(timer);
      }
    },
  };
};

/** Lance le CLI et attend sa fin (ou sa mise à mort) ; erreur typée si le binaire est inutilisable. */
export const runProcess = (spec: SpawnSpec, options: ProcessOptions): Promise<ProcessOutcome> =>
  new Promise((resolve, reject) => {
    const child = launch(spec, options);
    const stopper = createStopper(child, options);
    const collector = collect(child, options.hardOutputBytes, () => stopper.stop("exceeded"));
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(options.stdin);
    child.once("error", () => {
      stopper.dispose();
      reject(unavailable());
    });
    child.once("close", (exitCode) => {
      signalGroup(child.pid, "SIGKILL"); // survivants éventuels du groupe
      stopper.dispose();
      collector.reader.end();
      const stopped = stopper.reason();
      resolve({
        ...(stopped === undefined ? {} : { stopped }),
        exitCode,
        stream: collector.reader.state,
        stderr: collector.stderr(),
      });
    });
  });
