/** Validation du worktree avant tout lancement (squelette du lot 73c). */

/**
 * Chemin réel (`realpath`) du worktree s'il est sous une des racines autorisées ;
 * sinon `InvalidAgentRequestError("worktree")`, sans lancer aucun processus.
 */
export const resolveWorktree = async (
  _worktree: string,
  _allowedRoots: readonly string[],
): Promise<string> => {
  throw new Error("not implemented: lot 73c Green");
};
