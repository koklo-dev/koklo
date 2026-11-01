/** Validation de la configuration de l'adaptateur, à la construction (jamais au lancement). */
import { isAbsolute } from "node:path";
import { AgentRuntimeUnavailableError } from "../agent-errors.ts";
import { isForbiddenExtraEnv } from "./environment.ts";

export const DEFAULT_CLAUDE_EXECUTABLE = "claude";

export interface RuntimeConfig {
  readonly executable?: string;
  readonly allowedRoots: readonly string[];
  readonly parentEnv?: Readonly<Record<string, string | undefined>>;
  readonly extraEnv?: Readonly<Record<string, string>>;
}

const refuse = (): never => {
  throw new AgentRuntimeUnavailableError({ operation: "configure", runtime: "claude-code" });
};

const isPlainAbsolute = (path: unknown): path is string =>
  typeof path === "string" &&
  isAbsolute(path) &&
  !path.includes("\0") &&
  !path.split("/").includes("..");

/** Un binaire relatif (ou une entrée relative du PATH) serait résolu depuis le cwd du fils. */
const checkExecutable = (config: RuntimeConfig): void => {
  const executable = config.executable ?? DEFAULT_CLAUDE_EXECUTABLE;
  if (executable !== DEFAULT_CLAUDE_EXECUTABLE) {
    if (!isPlainAbsolute(executable)) {
      refuse();
    }
    return;
  }
  const path = (config.parentEnv ?? process.env).PATH;
  if (path !== undefined && !path.split(":").every(isPlainAbsolute)) {
    refuse();
  }
};

const checkRoots = (roots: unknown): void => {
  if (!Array.isArray(roots) || !roots.every((root) => isPlainAbsolute(root) && root !== "/")) {
    refuse();
  }
};

/** Refuse un executable relatif, un PATH relatif, des racines dangereuses et un `extraEnv` hostile. */
export const assertRuntimeConfig = (config: RuntimeConfig): void => {
  checkExecutable(config);
  checkRoots(config.allowedRoots);
  if (Object.keys(config.extraEnv ?? {}).some(isForbiddenExtraEnv)) {
    refuse();
  }
};
