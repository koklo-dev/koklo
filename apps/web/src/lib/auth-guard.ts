import { SETTINGS_SECTIONS, SPEC_SLUGS } from "./shell-routes.ts";

export type GuardedPath =
  | "/login"
  | "/projects"
  | "/kanban"
  | "/members"
  | "/github"
  | "/settings"
  | `/settings/${string}`
  | "/organizations";

/** Pages d'un projet : `/projects/<un segment>` et ses sous-pages connues (TK-48d, TK-59, TK-88). */
export type ProjectPath = `/projects/${string}`;

const EXACT_PATHS: readonly string[] = [
  "/login",
  "/projects",
  "/kanban",
  "/members",
  "/github",
  "/settings",
  ...SETTINGS_SECTIONS.map((section) => `/settings/${section}`),
  "/organizations",
];
/**
 * `/projects/<un segment>`, `…/idea`, `…/framing`, `…/tickets`, `…/features` (ancien chemin, redirigé) ou
 * `…/spec/<livrable>` : jamais de sous-chemin inconnu ni de barre oblique finale.
 */
const PROJECT_PAGE = new RegExp(
  `^/projects/[^/]+(?:/(?:idea|framing|tickets|features)|/spec/(?:${SPEC_SLUGS.join("|")}))?$`,
);

/**
 * Résout un chemin de requête en page gardée : les chemins exacts de `GuardedPath`, puis les pages d'un projet.
 * Tout autre chemin (`/projects/<id>/other`, `/settings/inconnue`) : null, c'est un 404 de Next.
 */
export function guardedPathFor(pathname: string): GuardedPath | ProjectPath | null {
  if (EXACT_PATHS.includes(pathname)) return pathname as GuardedPath;
  return PROJECT_PAGE.test(pathname) ? (pathname as ProjectPath) : null;
}

/** Destinations de redirection possibles : on y renvoie, on ne renvoie jamais vers une page de la coquille. */
export type RedirectPath = "/login" | "/projects" | "/organizations";

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
