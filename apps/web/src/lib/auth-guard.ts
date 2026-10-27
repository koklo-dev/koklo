export type GuardedPath = "/login" | "/projects";

export interface AccessInput {
  path: GuardedPath;
  hasSession: boolean;
}

/** Destination de redirection pour une page selon la session, ou null si l'accès est permis. */
export function resolveAccess({ path, hasSession }: AccessInput): GuardedPath | null {
  if (path === "/projects" && !hasSession) return "/login";
  if (path === "/login" && hasSession) return "/projects";
  return null;
}

/** Une erreur UNAUTHORIZED de l'API renvoie vers la connexion ; les autres s'affichent dans l'écran. */
export function redirectForError(error: unknown): "/login" | null {
  const code = typeof error === "object" && error !== null ? Reflect.get(error, "code") : undefined;
  return code === "UNAUTHORIZED" ? "/login" : null;
}
