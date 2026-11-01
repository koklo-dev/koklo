/** Validation du worktree avant tout lancement. */
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, sep } from "node:path";
import { InvalidAgentRequestError } from "../agent-errors.ts";

const refuse = (): never => {
  throw new InvalidAgentRequestError("worktree");
};

const isPlainAbsolute = (path: string): boolean =>
  isAbsolute(path) && !path.includes("\0") && !path.split("/").includes("..");

const realOrUndefined = async (path: string): Promise<string | undefined> =>
  realpath(path).catch(() => undefined);

const isStrictlyUnder = (path: string, root: string): boolean => {
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  return path.startsWith(prefix) && path !== root;
};

/**
 * Chemin réel (`realpath`) du worktree s'il est un dossier strictement sous une des racines
 * autorisées ; sinon `InvalidAgentRequestError("worktree")`, sans lancer aucun processus.
 */
export const resolveWorktree = async (
  worktree: string,
  allowedRoots: readonly string[],
): Promise<string> => {
  if (typeof worktree !== "string" || !isPlainAbsolute(worktree)) {
    return refuse();
  }
  const real = await realOrUndefined(worktree);
  if (real === undefined || !(await stat(real)).isDirectory()) {
    return refuse();
  }
  const roots = (await Promise.all(allowedRoots.map(realOrUndefined))).filter(
    (root): root is string => root !== undefined,
  );
  return roots.some((root) => isStrictlyUnder(real, root)) ? real : refuse();
};
