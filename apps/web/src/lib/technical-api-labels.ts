import type { NfrSummary, OperationDetail, TechnicalContract } from "@koklo/contract";
import type { IconName } from "@koklo/ui";

/** Libellés des onglets API et Exigences (TK-116, maquette 14 l.222-279, 589-672). */
export const OPERATION_NOUN = { one: "opération", other: "opérations" };
export const NFR_NOUN = { one: "exigence", other: "exigences" };
export const OPERATION_SEARCH_LABEL = "Rechercher une opération";
export const OPERATION_SEARCH_PLACEHOLDER = "Rechercher une opération, ex. reservation.";
export const OPERATION_SORT = "Tri : zone puis nom";
export const OPERATION_SAVED = "Opération enregistrée";
export const NFR_SAVED = "Exigence enregistrée";
export const NO_OPERATION_TITLE = "Aucune opération pour l'instant";
export const NO_OPERATION_TEXT = "Une opération par action de l'API : entrées, sorties et erreurs.";
export const NO_NFR_TITLE = "Aucune exigence pour l'instant";
export const NO_NFR_TEXT = "Une exigence : une cible mesurable et sa vérification.";
export const OPERATIONS_ERROR_TITLE = "Impossible de charger les opérations";
export const OPERATION_ERROR_TITLE = "Impossible de charger l'opération";
export const NFR_ERROR_TITLE = "Impossible de charger les exigences";
export const LIST_ERROR_TEXT = "La lecture a échoué. Réessayez.";
export const COVERAGE_LATER = "Couverture : après la Qualité";
export const NFR_NOTE = "Une exigence = une cible mesurable + sa vérification au lot Qualité";

export const YAML_SOURCE_NOTE = "Un fichier par opération : c'est ce que l'agent lit et modifie.";
export const CONTRACT_NOTE =
  "Généré par le générateur de la stack retenue (ST-api). Si la stack change, le contrat est régénéré dans le nouveau langage ; le YAML reste la source.";

/** Phrase affichée à la place du code quand aucun contrat ne peut être généré (B770). */
export function noContractText(contract: Extract<TechnicalContract, { available: false }>): string {
  if (contract.reason === "no_choice") {
    return "Aucun contrat : le choix ST-api reste à trancher.";
  }
  return `Aucun générateur pour la stack retenue (${contract.choice ?? "—"}) : seul TypeScript · oRPC est disponible.`;
}

/** Permission lue en liste : sans « PM- » ; l'appel interne se dit « interne ». */
export const permissionShortOf = (permission: string): string =>
  permission === "internal" ? "interne" : permission.replace(/^PM-/, "");

/** Identifiant de la première pastille « Qui peut appeler » : la permission entière, « public » ou « interne ». */
export const permissionIdOf = (permission: string): string =>
  permission === "internal" ? "interne" : permission;

const OPEN_CALLERS: Record<string, string> = {
  public: "Tout le monde",
  internal: "Appel interne",
};

/** Appelants affichés : ceux des rôles ; sans rôle, ce que dit la permission (publique, interne, ou rien). */
export function callersOf({
  permission,
  callers,
}: Pick<OperationDetail, "permission" | "callers">) {
  if (callers.length === 0) return [OPEN_CALLERS[permission] ?? ""];
  return callers.map(({ name, restriction }) => (restriction ? `${name} (${restriction})` : name));
}

export const NFR_CATEGORIES: ReadonlyArray<{
  value: NfrSummary["category"];
  label: string;
  icon: IconName;
}> = [
  { value: "data", label: "Données personnelles", icon: "shield" },
  { value: "performance", label: "Performance", icon: "speed" },
  { value: "security", label: "Sécurité", icon: "lock" },
  { value: "availability", label: "Disponibilité", icon: "cloud_done" },
  { value: "accessibility", label: "Accessibilité", icon: "accessibility_new" },
  { value: "operations", label: "Exploitation", icon: "monitoring" },
];

export const VERIFICATION_LABELS: Record<NfrSummary["verification"], string> = {
  scenario: "Scénario du lot Qualité",
  ci_measure: "Mesure en CI",
  manual: "Exercice manuel",
  to_define: "À définir",
};

/** « Scénario du lot Qualité · TS-041 ». */
export const verificationText = (verification: string, detail: string | undefined): string =>
  [VERIFICATION_LABELS[verification as NfrSummary["verification"]] ?? "", detail]
    .filter(Boolean)
    .join(" · ");
