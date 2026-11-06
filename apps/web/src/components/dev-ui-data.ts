import type { EntityKind, LifecycleStage, PriorityLevel } from "@koklo/ui";

/**
 * Données fictives et statiques de la galerie `/dev/ui` (fiche S-dev-ui §3) : aucune donnée personnelle,
 * aucun appel d'API, aucune valeur de couleur (les nuanciers ne montrent que le nom du jeton).
 */
export const SURFACES = [
  { role: "Fond", token: "--background", swatch: "bg-background" },
  { role: "Surface", token: "--surface", swatch: "bg-surface" },
  { role: "Élevé", token: "--raised", swatch: "bg-raised" },
  { role: "Bordure", token: "--border", swatch: "bg-border" },
  { role: "Bordure forte", token: "--border-strong", swatch: "bg-border-strong" },
  { role: "Fond de différence", token: "--diff-bg", swatch: "bg-diff-bg" },
] as const;

export const TYPE_SCALE = [
  { spec: "Titre de page · 24 / 600", className: "text-page-title", sample: "Fonctionnalités" },
  { spec: "Section · 16 / 600", className: "text-section-title", sample: "Critères d'acceptation" },
  { spec: "Sous-section · 14 / 600", className: "text-subsection-title", sample: "Éléments liés" },
  {
    spec: "Corps · 14 / 400",
    className: "text-body",
    sample: "La personne se connecte avec son adresse e-mail.",
  },
  {
    spec: "Secondaire · 13 / 400",
    className: "text-meta text-muted-foreground",
    sample: "Mis à jour il y a 12 min par Awa",
  },
  {
    spec: "Libellé de groupe · 11 / 600",
    className: "text-group-label uppercase text-muted-foreground",
    sample: "Spec",
  },
  { spec: "Pastilles · 12 / 500", className: "text-caption", sample: "À valider" },
  {
    spec: "Code · 12 / 500",
    className: "font-mono text-code",
    sample: "F-001 · S-login · a1b2c3d",
  },
] as const;

export const LIFECYCLE_RULES: ReadonlyArray<{ stage: LifecycleStage; rule: string }> = [
  { stage: 0, rule: "Décrite dans le dossier, pas encore dans la spec" },
  { stage: 1, rule: "Au moins un critère d'acceptation" },
  { stage: 2, rule: "Liée à un écran" },
  { stage: 3, rule: "Une PR fusionnée la référence" },
  { stage: 4, rule: "Chaque critère a un test vert" },
  { stage: 5, rule: "Présente dans une baseline" },
];

export const SCREEN_LABELS = [
  { status: "validated", label: "Acceptée" },
  { status: "pending", label: "À relire" },
  { status: "unsubmitted", label: "Rejetée", icon: "cancel" },
  { status: "validated", label: "Active" },
  { status: "unsubmitted", label: "Suspendue", icon: "block" },
  { status: "unsubmitted", label: "Désinstallée", icon: "cancel" },
  { status: "validated", label: "Autorisée" },
  { status: "pending", label: "À autoriser" },
] as const;

export const FEATURE_PRIORITIES: ReadonlyArray<{ level: PriorityLevel; label: string }> = [
  { level: 3, label: "Indispensable" },
  { level: 2, label: "Importante" },
  { level: 1, label: "Souhaitable" },
  { level: 0, label: "Reportée" },
];

export const TICKET_PRIORITIES: ReadonlyArray<{ level: PriorityLevel; label: string }> = [
  { level: 3, label: "Priorité critique" },
  { level: 2, label: "Priorité haute" },
  { level: 1, label: "Priorité moyenne" },
  { level: 0, label: "Priorité basse" },
];

export const ENTITY_PREVIEW = {
  title: "F-001 · Connexion par e-mail",
  summary: "3 critères · liée à S-login",
};

export const ENTITIES: ReadonlyArray<{ kind: EntityKind; id: string; title?: string }> = [
  { kind: "feature", id: "F-001", title: "Connexion" },
  { kind: "screen", id: "S-login" },
  { kind: "ticket", id: "TK-104" },
  { kind: "role", id: "RL-owner" },
  { kind: "table", id: "T-users" },
  { kind: "rule", id: "R-001" },
  { kind: "endpoint", id: "E-auth-login" },
  { kind: "commit", id: "a1b2c3d" },
];

export const PHASE_SUBTITLES = {
  idea: "Dossier stable, 8 pages sur 10",
  framing: "4 fonctionnalités sur 7 validées",
  baseline: "Posée à la validation du client",
  iterations: "Sprints et demandes de changement",
};
