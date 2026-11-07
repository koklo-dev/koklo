import type { SpecKey } from "@koklo/ui";

/** Adresses de la coquille (TK-88) : un seul endroit, aucune adresse écrite à la main dans les composants. */

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Les sept livrables de la spec ; l'adresse d'un livrable est `/projects/<id>/spec/<clé>`. */
export const SPEC_SLUGS = [
  "functional",
  "data",
  "architecture",
  "technical",
  "security",
  "design",
  "quality",
] as const satisfies readonly SpecKey[];
export type SpecSlug = (typeof SPEC_SLUGS)[number];

export const isSpecSlug = (value: string): value is SpecSlug =>
  (SPEC_SLUGS as readonly string[]).includes(value);

/** Sections de Réglages, dans l'ordre des onglets. */
export const SETTINGS_SECTIONS = ["members", "github", "ai"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const isSettingsSection = (value: string): value is SettingsSection =>
  (SETTINGS_SECTIONS as readonly string[]).includes(value);

export const PROJECTS_PATH = "/projects";
export const settingsPath = (section: SettingsSection): string => `/settings/${section}`;
export const projectPath = (projectId: string): string => `/projects/${projectId}`;
export const ideaPath = (projectId: string): string => `/projects/${projectId}/idea`;
export const framingPath = (projectId: string): string => `/projects/${projectId}/framing`;
export const ticketsPath = (projectId: string): string => `/projects/${projectId}/tickets`;
export const specPath = (projectId: string, slug: SpecSlug): string =>
  `/projects/${projectId}/spec/${slug}`;

/**
 * Cahier fonctionnel, onglet Fonctionnalités : `tab=features` est toujours écrit, suivi du reste de la requête
 * (filtres, `q`, `sel`…). Un `tab` déjà présent est remplacé.
 */
export function featuresPath(projectId: string, search = ""): string {
  const params = new URLSearchParams(search);
  params.delete("tab");
  const rest = params.toString();
  return `${specPath(projectId, "functional")}?tab=features${rest ? `&${rest}` : ""}`;
}

/** Identifiant du projet de la page courante (uuid valide seulement), sinon null. */
export function projectIdFromPath(pathname: string): string | null {
  const segment = /^\/projects\/([^/]+)(?:\/|$)/.exec(pathname)?.[1];
  return segment && UUID.test(segment) ? segment : null;
}

/** Livrable de la spec ouvert, ou undefined hors de `/projects/<id>/spec/<livrable>`. */
export function activeSpecSlug(pathname: string): SpecSlug | undefined {
  const slug = /^\/projects\/[^/]+\/spec\/([^/]+)\/?$/.exec(pathname)?.[1];
  return slug && isSpecSlug(slug) ? slug : undefined;
}
