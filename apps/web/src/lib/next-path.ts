const DEFAULT_PATH = "/projects";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const INVITATION_PATH = new RegExp(`^/accept-invitation/${UUID}$`, "i");
const UUID_ONLY = new RegExp(`^${UUID}$`, "i");

export const isInvitationId = (value: string): boolean => UUID_ONLY.test(value);

/**
 * Destination de retour après connexion : liste blanche `/accept-invitation/<uuid>`,
 * tout le reste (URL absolue, `//hôte`, antislash, autre chemin) ramène à `/projects`.
 */
export function resolveNextPath(value?: string | null): string {
  return value && INVITATION_PATH.test(value) ? value : DEFAULT_PATH;
}

/** `/login` qui ramène à `path` si c'est une destination autorisée, `/login` seul sinon. */
export function loginPathFor(path: string): string {
  return resolveNextPath(path) === path ? `/login?next=${encodeURIComponent(path)}` : "/login";
}
