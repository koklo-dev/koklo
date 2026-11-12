/**
 * Volumes des jeux de charge (TK-94, décision B19). `seed:large` éprouve les listes longues
 * (passation 07 §6), `seed:planche` reproduit la planche « Volume réel » (passation 08 §4).
 */
export type VolumeProfile = "large" | "planche";

/** Ce que le schéma sait porter aujourd'hui et que les deux profils insèrent. */
export interface SeededVolume {
  features: number;
  tables: number;
  endpoints: number;
  tickets: number;
  /** Règles métier, parcours, rôles et leurs permissions de l'index d'entités (TK-103, B343). */
  rules: number;
  flows: number;
  roles: number;
  permissions: number;
  /** Propositions de l'agent (TK-99a, TK-105) : un lancement terminé et ses propositions, groupées par type et par zone. */
  proposals: number;
}

export const SEED_VOLUMES: Record<VolumeProfile, SeededVolume> = {
  large: {
    features: 1000,
    tables: 80,
    endpoints: 50,
    tickets: 500,
    rules: 300,
    flows: 18,
    roles: 3,
    permissions: 47,
    proposals: 400,
  },
  // 47 « actions » de la planche = points d'accès ; la planche ne donne aucun volume de tickets,
  // 60 permettent d'exercer le kanban à l'écran (lecture prudente, B34).
  planche: {
    features: 248,
    tables: 65,
    endpoints: 47,
    tickets: 60,
    rules: 86,
    flows: 18,
    roles: 3,
    permissions: 47,
    // 248 fonctionnalités + 86 règles + 3 rôles + 18 parcours relus (TK-105, B365).
    proposals: 355,
  },
};

/** Volume d'un type de donnée dont le modèle n'existe pas encore, et le ticket qui le créera. */
export interface PendingVolume {
  count: number;
  ticket: string;
}

type PendingProfile = Partial<Record<"sampleRows", PendingVolume>>;

/**
 * Volumes demandés par les passations pour des modèles absents du schéma : déclarés, jamais insérés
 * (lecture prudente, B34). Chaque ticket d'accueil devra étendre `seed:large` / `seed:planche`.
 */
export const PENDING_VOLUMES: Record<VolumeProfile, PendingProfile> = {
  large: {},
  planche: {
    sampleRows: { count: 1240, ticket: "ticket du lot 6 (jeux d'exemple)" },
  },
};

/**
 * Noms des modèles Prisma qui porteront ces données. Quand l'un d'eux apparaît dans `schema.prisma`,
 * un test échoue : il faut alors l'insérer dans les deux profils et le retirer de cette liste.
 */
export const PENDING_MODELS: readonly string[] = [
  "Proposal",
  "SpecProposal",
  "SampleSet",
  "SampleRow",
];
