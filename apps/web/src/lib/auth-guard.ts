export type GuardedPath =
  | "/login"
  | "/projects"
  | "/kanban"
  | "/members"
  | "/github"
  | "/organizations";

/** Destinations de redirection possibles (jamais /kanban ni /github : on y entre, on n'y renvoie pas). */
export type RedirectPath = Exclude<GuardedPath, "/kanban" | "/github">;

export interface AccessInput {
  path: GuardedPath;
  hasSession: boolean;
  /** Ignoré sans session ; absent = on ne sait pas, donc on ne renvoie pas vers /organizations. */
  hasActiveOrganization?: boolean;
}

/**
 * Destination de redirection pour une page, ou null si l'accès est permis.
 * Seule l'absence de session mène à /login (G1) : une session sans organisation active
 * est renvoyée vers /organizations, qui n'a pas de redirection sortante.
 */
export function resolveAccess({
  path,
  hasSession,
  hasActiveOrganization = true,
}: AccessInput): RedirectPath | null {
  if (!hasSession) return path === "/login" ? null : "/login";
  if (path === "/login") return "/projects";
  const needsOrganization =
    path === "/projects" || path === "/kanban" || path === "/members" || path === "/github";
  return needsOrganization && !hasActiveOrganization ? "/organizations" : null;
}

/**
 * Une erreur UNAUTHORIZED de l'API renvoie vers /login si la session est perdue, sinon vers
 * /organizations (session valide mais pas d'organisation active) ; les autres s'affichent dans l'écran.
 */
export function redirectForError(
  error: unknown,
  { hasSession }: { hasSession?: boolean } = {},
): "/login" | "/organizations" | null {
  const code = typeof error === "object" && error !== null ? Reflect.get(error, "code") : undefined;
  if (code !== "UNAUTHORIZED") return null;
  return hasSession ? "/organizations" : "/login";
}
