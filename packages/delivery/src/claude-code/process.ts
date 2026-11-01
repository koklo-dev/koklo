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
  /** Octets reçus jusqu'ici (stdout + stderr). */
  received(): number;
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
  return { reader, stderr: () => stderr, received: () => bytes };
};

/** Marge après le délai de grâce avant de résoudre de force, même si le fils ne se ferme pas. */
export const FORCE_RESOLVE_MARGIN_MS = 500;
/** Délai de vidange des pipes après la sortie du fils, avant de les détruire (petit-fils porteur). */
export const DRAIN_MS = 50;
/** Passes de la boucle d'événements accordées à la lecture de ce qui est déjà dans les pipes. */
export const MAX_DRAIN_PASSES = 20;

/**
 * Appelle `done` quand une passe de la boucle d'événements (phase de lecture comprise) n'a plus rien
 * apporté : ce que le fils a écrit avant de sortir est lu avant la destruction des flux, même si la
 * boucle a été retardée. Borné par `MAX_DRAIN_PASSES` (un petit-fils bavard ne retient pas la session).
 */
const drainThen = (received: () => number, done: () => void): void => {
  let last = -1;
  let passes = 0;
  const pass = (): void => {
    if (received() === last || passes++ >= MAX_DRAIN_PASSES) {
      done();
      return;
    }
    last = received();
    setImmediate(pass);
  };
  pass();
};

interface Stopper {
  readonly reason: () => StopReason | undefined;
  readonly stop: (reason: StopReason) => void;
  readonly dispose: () => void;
}

/**
 * Première raison gagnante : SIGTERM au groupe, SIGKILL après le délai de grâce, puis résolution
 * forcée (`onForce`) après une marge si le fils ne se ferme toujours pas.
 */
const createStopper = (
  child: ChildProcess,
  options: ProcessOptions,
  onForce: () => void,
): Stopper => {
  let reason: StopReason | undefined;
  const timers: NodeJS.Timeout[] = [];
  const stop = (why: StopReason): void => {
    if (reason !== undefined) {
      return;
    }
    reason = why;
    signalGroup(child.pid, "SIGTERM");
    timers.push(setTimeout(() => signalGroup(child.pid, "SIGKILL"), options.killGraceMs));
    timers.push(setTimeout(onForce, options.killGraceMs + FORCE_RESOLVE_MARGIN_MS));
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

/**
 * Lance le CLI et attend sa fin (ou sa mise à mort) ; erreur typée si le binaire est inutilisable.
 * Résout sur `close` OU, au plus tard `DRAIN_MS` après `exit`, quand un petit-fils garde les pipes
 * ouverts : le groupe est alors tué (SIGKILL) et les flux détruits. Un petit-fils qui a quitté le
 * groupe (`setsid`) n'est pas tué : limite assumée, ADR 0014.
 */
export const runProcess = (spec: SpawnSpec, options: ProcessOptions): Promise<ProcessOutcome> =>
  new Promise((resolve, reject) => {
    const child = launch(spec, options);
    let exitCode: number | null = null;
    let settled = false;
    const settle = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      signalGroup(child.pid, "SIGKILL"); // survivants éventuels du groupe
      stopper.dispose();
      child.stdout?.destroy();
      child.stderr?.destroy();
      collector.reader.end();
      const stopped = stopper.reason();
      resolve({
        ...(stopped === undefined ? {} : { stopped }),
        exitCode,
        stream: collector.reader.state,
        stderr: collector.stderr(),
      });
    };
    const stopper = createStopper(child, options, settle);
    const collector = collect(child, options.hardOutputBytes, () => stopper.stop("exceeded"));
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(options.stdin);
    child.once("error", () => {
      settled = true;
      stopper.dispose();
      reject(unavailable());
    });
    child.once("exit", (code) => {
      exitCode = code;
      signalGroup(child.pid, "SIGKILL");
      setTimeout(() => drainThen(collector.received, settle), DRAIN_MS).unref();
    });
    child.once("close", (code) => {
      exitCode = code;
      settle();
    });
  });
