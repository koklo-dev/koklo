import type { AiProviderItemOutput } from "@koklo/contract";

/** Libellés de l'écran « Fournisseurs d'IA » (design/screens/S-ai-settings.md v2). Jamais « jeton », « secret » ni « BYOK » en libellé. */
export const AI_SETTINGS_LABELS = {
  title: "Fournisseurs d'IA",
  intro:
    "Koklo utilise les comptes d'IA de votre organisation pour le cadrage assisté. Vous fournissez vos propres clés : elles sont facturées par le fournisseur, pas par Koklo.",
  restricted:
    "Cette page est réservée aux propriétaires et aux administrateurs. Demandez à l'un d'eux de configurer l'IA.",
  loadingRole: "Chargement…",
  loadingList: "Chargement des fournisseurs d'IA…",
  loadFailedTitle: "Impossible de charger les fournisseurs d'IA",
  providers: "Fournisseurs",
  providersIntro:
    "Une clé par fournisseur. Koklo appelle le fournisseur directement, sans intermédiaire, sauf OpenRouter.",
  noProvider: "Aucun fournisseur configuré. L'IA est indisponible.",
  encrypted:
    "Chaque clé est chiffrée sur nos serveurs. Elle ne peut plus être affichée, seulement remplacée ou retirée.",

  // Pastilles et statuts (icône + texte)
  primary: "Principal",
  fallback: "Secours",
  intermediary: "Intermédiaire",
  intermediaryNote:
    "Vos requêtes passent par OpenRouter avant d'arriver au fournisseur du modèle. Il n'est pas proposé sur un projet qui exige des données en UE.",
  unverified: "Non vérifiée",
  invalid: "Refusée",

  // Actions
  add: "Ajouter un fournisseur",
  verify: "Vérifier",
  replace: "Remplacer la clé",
  remove: "Retirer",
  setPrimary: "Mettre en principal",
  confirm: "Confirmer",
  keep: "Garder",
  cancel: "Annuler",
  confirmRemoval:
    "Retirer ce fournisseur ? Sa clé sera supprimée ; la consommation passée est conservée.",
  confirmRemovalGroup: "Confirmer le retrait du fournisseur",
  confirmPrimaryGroup: "Confirmer le changement de fournisseur principal",

  // Formulaire d'ajout et de remplacement
  chooseProvider: "Fournisseur à ajouter",
  chooseTitle: "Choisir un fournisseur",
  keyPlaceholder: "Collez la clé",
  keyHint:
    "Koklo envoie une requête de test, puis ne garde la clé que si elle répond. Elle est chiffrée et n'est jamais réaffichée.",
  baseUrlLabel: "Adresse de l'API",
  baseUrlHint: "Adresse https du point d'accès compatible.",
  modelLabel: "Modèle à utiliser",
  modelHint: "Aucun modèle qualifié pour ce fournisseur : indiquez celui à utiliser.",
  emptyKey: "Saisissez la clé.",
  emptyBaseUrl: "Saisissez l'adresse de l'API.",
  emptyModel: "Saisissez le modèle à utiliser.",
  submitAdd: "Vérifier et enregistrer",
  submitReplace: "Vérifier et remplacer",
  testing: "Vérification…",
  testingStatus: "Test de la clé en cours. Cela peut prendre quelques secondes.",
  added: "Fournisseur ajouté et vérifié.",
  replaced: "Clé remplacée et vérifiée.",
  verified: "Clé vérifiée.",
  removed: "Fournisseur retiré.",
  madePrimary: "Fournisseur principal mis à jour.",

  // Modèle par usage
  usageTitle: "Modèle par usage",
  usageIntro:
    "Chaque usage utilise le modèle par défaut du fournisseur principal, sauf si vous en choisissez un autre. Seuls les modèles qui passent nos tests sur chaque usage (sortie structurée, respect du schéma) sont proposés.",
  change: "Changer",
  defaultModel: "Modèle par défaut",
  economy: "économique",
  noQualified: "Aucun modèle qualifié pour cet usage.",

  // Secours
  fallbackTitle: "Basculer sur le fournisseur de secours",
  fallbackNeedsTwo: "Ajoutez un deuxième fournisseur pour activer le secours.",
  fallbackOff: "Le secours est désactivé : une erreur du fournisseur principal reste une erreur.",
  fallbackSelect: "Fournisseur de secours",

  // À quoi servent ces clés
  purposesTitle: "À quoi servent ces clés",
  purposeNever:
    "Agents de code : jamais. Ils tournent sur les postes, avec l'outil et l'abonnement de chacun.",

  // Consommation
  consumptionNote: "Montants estimés, convertis des dollars facturés au taux de 1 € pour 1 $.",
  capLabel: "Plafond mensuel (en euros)",
  capHint: "Un seul plafond pour tous les fournisseurs. Laissez vide pour ne pas en fixer.",
  capSave: "Enregistrer le plafond",
  capInvalid: "Saisissez un montant supérieur à 0, ou laissez vide pour retirer le plafond.",
  capSaved: "Plafond enregistré.",
  capWarning: "Vous avez atteint 80 % du plafond mensuel.",
  capSuspended:
    "Plafond atteint : l'IA est suspendue jusqu'au mois prochain ou jusqu'à un nouveau plafond.",
  noConsumption: "Aucune consommation ce mois-ci.",
  writeFailed: "L'enregistrement a échoué. Réessayez.",
} as const;

export const USAGE_LABELS = {
  idea_space: "Cadrage de l'idée",
  spec_deliverables: "Livrables de la spec",
  baseline_summary: "Résumé de la base de départ",
  ticket_breakdown: "Découpage en tickets",
} as const;

export const USAGE_PURPOSES = {
  idea_space: "Transforme votre idée en brief structuré.",
  spec_deliverables: "Propose les fonctionnalités et les règles de la spécification.",
  baseline_summary: "Résume le dépôt existant pour partir d'une base commune.",
  ticket_breakdown: "Découpe une fonctionnalité en tickets de développement.",
} as const;

export type UsageId = keyof typeof USAGE_LABELS;
export const USAGES = Object.keys(USAGE_LABELS) as UsageId[];

type Role = AiProviderItemOutput["role"];

/** « principal », « secours » ou rien : fragment du nom accessible d'une ligne. */
export const roleWord = (role: Role): string | null =>
  role === "primary" ? "principal" : role === "fallback" ? "secours" : null;

/** Date longue en français (« 20 octobre 2026 ») : jamais d'heure relative seule. */
export const longDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "long" });

/** « novembre 2026 » depuis « 2026-11 ». */
export const monthLabel = (month: string): string =>
  new Date(`${month}-01T12:00:00Z`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
