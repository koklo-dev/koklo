import type { FeatureDetail } from "@koklo/contract";
import type { Feature } from "@koklo/schema";

/** Détail rendu au client : le contenu du fichier au commit indexé, plus chemin et SHA de l'index. */
export function detailOf(feature: Feature, filePath: string, commitSha: string): FeatureDetail {
  return {
    specId: feature.id,
    title: feature.titre,
    status: feature.statut,
    priority: feature.priorite,
    description: feature.description,
    criteria: feature.criteres.map((criterion, index) => ({
      specId: criterion.id,
      position: index + 1,
      title: criterion.titre,
      steps: criterion.etapes.map((step) => ({ type: step.type, text: step.texte })),
    })),
    tables: feature.tables,
    endpoints: feature.endpoints,
    screens: feature.ecrans,
    roles: feature.roles,
    rules: feature.regles,
    nfr: feature.nfr,
    filePath,
    commitSha,
  };
}
