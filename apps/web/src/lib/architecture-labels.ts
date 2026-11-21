import { formatCount } from "@koklo/ui";

/** Libellés de l'écran Architecture (maquette 13) : un seul endroit, aucune phrase dans les composants de liste. */
export const COMPONENT_NOUN = { one: "composant", other: "composants", masculine: true } as const;
/** Nom d'un flux au compte et au pied de liste (maquette 13 l.410 : « 18 flux »). */
export const FLOW_NOUN = { one: "flux", other: "flux", masculine: true } as const;
export const COMPONENTS_SEARCH_LABEL = "Rechercher un composant";
export const COMPONENTS_SEARCH_PLACEHOLDER = "Rechercher un composant ou C-…";
export const COMPONENTS_TABLE_LABEL = "Composants de l'architecture";

/** Type d'un composant (`type`) en clair, comme dans la feuille (maquette 16 l.151). */
export const COMPONENT_TYPE_LABELS: Record<string, string> = {
  app: "Application",
  service: "Service",
  store: "Stockage",
  queue: "File de tâches",
  ext: "Externe",
};

export const componentTypeLabel = (type: string): string => COMPONENT_TYPE_LABELS[type] ?? type;

/** Maquette 13 l.104-109 : bandeau de la génération. */
export const ARCHITECTURE_GENERATING =
  "L'agent rédige l'architecture zone par zone : composants, flux, décisions. Les premières propositions arrivent avant la fin. Vous pouvez quitter la page.";

/** Maquette 13 l.96 : l'état Prêt. */
export const ARCHITECTURE_READY_TITLE = "L'agent peut proposer l'architecture";
export const ARCHITECTURE_READY_TEXT =
  "À partir du cahier fonctionnel et du modèle de données validés : les composants et leurs responsabilités, le schéma d'ensemble, les flux des parcours principaux et les décisions d'architecture argumentées. Vous relisez tout avant que rien n'entre dans la spec.";

const plural = (count: number, one: string, other: string): string =>
  `${formatCount(count)} ${count >= 2 ? other : one}`;

/** Annonce d'un résultat de recherche ou de filtre : « 3 composants trouvés sur 34 », « Aucun composant ne correspond à « x » ». */
export function componentsResultText(options: {
  q: string | undefined;
  zone: string | undefined;
  total: number;
  projectTotal: number | undefined;
}): string {
  const { q, zone, total, projectTotal } = options;
  if (total === 0) {
    return q ? `Aucun composant ne correspond à « ${q} »` : "Aucun composant dans cette zone.";
  }
  if (!q && !zone) return "";
  const found = plural(total, "composant trouvé", "composants trouvés");
  return projectTotal === undefined ? found : `${found} sur ${formatCount(projectTotal)}`;
}

/** Pied du tableau : « Les 50 suivants se chargent… » ou « Fin de la liste · 34 composants » (maquette 13 l.374). */
export function componentsFooterText(loaded: number, total: number): string {
  return loaded < total
    ? `Les ${Math.min(50, total - loaded)} suivants se chargent automatiquement en approchant du bas.`
    : `Fin de la liste · ${plural(total, "composant", "composants")}`;
}

/** Identifiants d'une cellule « Dépend de » ou « Décisions » : « 3 », « ADR-001, ADR-002 », « — ». */
export const decisionsText = (ids: readonly string[]): string =>
  ids.length > 0 ? ids.join(", ") : "—";

/** Message d'un avertissement d'architecture, jamais bloquant (B511). */
export const CHECKS_TITLE = "Avertissements d'architecture";
export const CHECKS_NOTE = "Ils n'empêchent pas l'enregistrement.";

/** Actions rapides de la colonne Agent (maquette 13 l.757) : mode du lancement et consigne préremplie. */
export const DOC_AGENT_ACTIONS = [
  {
    icon: "edit_note",
    label: "Rédiger les sections à rédiger",
    mode: "document",
    instruction: "",
  },
  {
    icon: "fact_check",
    label: "Vérifier la cohérence avec les décisions",
    mode: "document",
    instruction: "Vérifier la cohérence du document avec les décisions enregistrées",
  },
  {
    icon: "summarize",
    label: "Résumer pour le client",
    mode: "document",
    instruction: "Résumer le document en langage simple pour le client",
  },
] as const;
