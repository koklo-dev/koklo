export type GuardedPath =
  | "/login"
  | "/projects"
  | "/kanban"
  | "/members"
  | "/github"
  | "/organizations";

/** Page d'un projet (TK-48d) : chemin dynamique, un seul segment `projectId`. */
export type ProjectFeaturesPath = `/projects/${string}/features`;
/** Cadrage assisté d'un projet (TK-59) : gardé comme la liste des fonctionnalités. */
export type ProjectFramingPath = `/projects/${string}/framing`;
export type ProjectPath = ProjectFeaturesPath | ProjectFramingPath;

const EXACT_PATHS: readonly GuardedPath[] = [
  "/login",
  "/projects",
  "/kanban",
  "/members",
  "/github",
  "/organizations",
];
/** `/projects/<un segment>/features` ou `/framing` : jamais de sous-chemin ni de barre oblique finale. */
const PROJECT_PAGE = /^\/projects\/[^/]+\/(?:features|framing)$/;

/**
 * Résout un chemin de requête en page gardée : les chemins exacts de `GuardedPath`, puis
 * `/projects/<un segment>/features` et `/projects/<un segment>/framing`. Tout autre chemin
 * (`/projects/<id>`, `/projects/<id>/features/x`) : null.
 */
export function guardedPathFor(pathname: string): GuardedPath | ProjectPath | null {
  const exact = EXACT_PATHS.find((path) => path === pathname);
  if (exact) return exact;
  return PROJECT_PAGE.test(pathname) ? (pathname as ProjectPath) : null;
}

/** Destinations de redirection possibles (jamais /kanban ni /github : on y entre, on n'y renvoie pas). */
export type RedirectPath = Exclude<GuardedPath, "/kanban" | "/github">;

export interface AccessInput {
  path: GuardedPath | ProjectPath;
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
  return path !== "/organizations" && !hasActiveOrganization ? "/organizations" : null;
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
