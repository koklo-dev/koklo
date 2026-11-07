import { featuresPath, settingsPath } from "./shell-routes.ts";

const PROJECT_FEATURES = /^\/projects\/([^/]+)\/features$/;

/**
 * Anciens chemins redirigés par le proxy (B78) avec toute la requête conservée : les fonctionnalités d'un projet,
 * Membres et GitHub passent dans la coquille. `/kanban` et `/` sont résolus par une page serveur (dernier projet).
 */
export function legacyRedirect(pathname: string, search: string): string | null {
  const features = PROJECT_FEATURES.exec(pathname)?.[1];
  if (features) return featuresPath(features, search);
  if (pathname === "/members") return `${settingsPath("members")}${search}`;
  if (pathname === "/github") return `${settingsPath("github")}${search}`;
  return null;
}
