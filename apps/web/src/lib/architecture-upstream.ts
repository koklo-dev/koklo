import { withDataUrl } from "./data-tab.ts";
import { featuresPath, specPath } from "./shell-routes.ts";

/**
 * « Voir les changements » (B579) : pas de différences champ par champ ; le bouton ouvre l'écran amont sur le premier
 * élément modifié : la table dans Données, la fonctionnalité ou la règle dans le Fonctionnel.
 */
export function upstreamTargetOf(projectId: string, id: string): string {
  if (id.startsWith("T-")) {
    return `${specPath(projectId, "data")}${withDataUrl("", { tab: "tables", sel: id })}`;
  }
  return featuresPath(projectId, `sel=${encodeURIComponent(id)}`);
}

/** « Voir les changements » du Technique : l'Architecture sur le premier composant ou la première décision. */
export function architectureTargetOf(projectId: string, id: string): string {
  const query = id.startsWith("ADR-")
    ? `?tab=decisions&d=${encodeURIComponent(id)}`
    : `?sel=${encodeURIComponent(id)}`;
  return `${specPath(projectId, "architecture")}${query}`;
}
