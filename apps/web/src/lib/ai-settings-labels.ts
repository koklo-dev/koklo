/** Libellés de l'écran des réglages de l'IA (design/screens/S-ai-settings.md §3 à §5). Jamais « jeton », « secret », « token » ni « BYOK ». */
export const AI_SETTINGS_LABELS = {
  title: "IA",
  intro:
    "Koklo utilise le compte d'IA de votre organisation pour le cadrage assisté. Vous fournissez votre propre clé : elle est facturée par le fournisseur, pas par Koklo.",
  provider: "Anthropic",
  restricted:
    "Cette page est réservée aux propriétaires et aux administrateurs. Demandez à l'un d'eux de configurer l'IA.",
  loadingRole: "Chargement…",
  loadingList: "Chargement des réglages de l'IA…",
  loadFailedTitle: "Impossible de charger les réglages de l'IA",
  encrypted:
    "Votre clé est chiffrée sur nos serveurs. Elle ne peut plus être affichée, seulement remplacée ou retirée.",
  quotaNote:
    "Chaque vérification est comptée dans les limites de votre organisation (5 par heure).",

  // Statuts (icône + texte)
  absent: "Non configurée",
  configured: "Configurée",
  invalid: "Refusée par le fournisseur (désactivée)",
  unreadable: "Illisible : à saisir à nouveau",
  verifying: "Vérification en cours…",

  // Texte de la carte selon l'état
  missingText:
    "Aucune clé n'est enregistrée. Le cadrage assisté ne fonctionnera pas tant qu'elle manque.",
  invalidText:
    "Le fournisseur a refusé la clé de l'organisation. L'IA est désactivée jusqu'à ce que vous la remplaciez.",
  unreadableText:
    "La clé enregistrée ne peut plus être lue. Saisissez-la de nouveau pour la remplacer.",

  // Formulaire
  keyLabel: "Clé API Anthropic",
  keyHint:
    "Collez la clé depuis la console de votre compte Anthropic. Elle ne sera plus jamais affichée.",
  emptyKey: "Saisissez la clé.",
  invalidKey: "Cette clé n'est pas valide.",
  advanced: "Avancé",
  modelLabel: "Modèle par défaut (facultatif)",
  modelHint: "Laissez vide pour utiliser le modèle recommandé par Koklo.",
  invalidModel: "Ce modèle n'est pas valide.",
  saveAndVerify: "Enregistrer et vérifier",
  saving: "Enregistrement et vérification…",
  verifyingShort: "Vérification…",
  cancel: "Annuler",

  // Actions
  verifyAgain: "Vérifier à nouveau",
  replace: "Remplacer la clé",
  remove: "Retirer la clé",
  keep: "Garder la clé",
  confirmGroup: "Confirmer le retrait de la clé",
  confirmRemoval:
    "Retirer la clé Anthropic ? L'IA cessera de fonctionner pour toute l'organisation (cadrage assisté) tant qu'une nouvelle clé n'aura pas été enregistrée. Cette action ne supprime rien chez Anthropic.",

  // Région d'état
  progressSave: "Enregistrement de la clé puis vérification. Cela peut prendre quelques secondes.",
  progressVerify: "Vérification de la clé. Cela peut prendre quelques secondes.",
  progressRemove: "Retrait de la clé.",
  removed: "Clé retirée.",
} as const;

/** « Clé enregistrée et vérifiée (modèle X). » (parcours « Enregistrer et vérifier »). */
export const savedAndVerified = (model: string): string =>
  `Clé enregistrée et vérifiée (modèle ${model}).`;
/** « Clé vérifiée (modèle X). » (« Vérifier à nouveau »). */
export const verifiedAgain = (model: string): string => `Clé vérifiée (modèle ${model}).`;
/** Ligne de la carte après une vérification réussie (état de session, perdu au rechargement). */
export const verifiedNow = (model: string): string =>
  `Vérifiée à l'instant avec le modèle ${model}`;

/** Date longue en français (« 20 octobre 2026 ») : jamais d'heure relative seule. */
export const longDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "long" });
