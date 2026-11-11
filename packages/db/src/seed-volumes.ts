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
  /** Propositions de l'agent (TK-99a) : un lancement terminé et ses propositions, en 3 groupes par zone. */
  proposals: number;
}

export const SEED_VOLUMES: Record<VolumeProfile, SeededVolume> = {
  large: { features: 1000, tables: 80, endpoints: 50, tickets: 500, proposals: 400 },
  // 47 « actions » de la planche = points d'accès ; la planche ne donne aucun volume de tickets,
  // 60 permettent d'exercer le kanban à l'écran (lecture prudente, B34).
  planche: { features: 248, tables: 65, endpoints: 47, tickets: 60, proposals: 0 },
};

/** Volume d'un type de donnée dont le modèle n'existe pas encore, et le ticket qui le créera. */
export interface PendingVolume {
  count: number;
  ticket: string;
}

type PendingProfile = Partial<Record<"rules" | "journeys" | "sampleRows", PendingVolume>>;

/**
 * Volumes demandés par les passations pour des modèles absents du schéma : déclarés, jamais insérés
 * (lecture prudente, B34). Chaque ticket d'accueil devra étendre `seed:large` / `seed:planche`.
 */
export const PENDING_VOLUMES: Record<VolumeProfile, PendingProfile> = {
  large: {
    rules: { count: 300, ticket: "ticket du lot 5 (règles métier)" },
  },
  planche: {
    rules: { count: 86, ticket: "ticket du lot 5 (règles métier)" },
    journeys: { count: 18, ticket: "ticket du lot 5 (parcours)" },
    sampleRows: { count: 1240, ticket: "ticket du lot 6 (jeux d'exemple)" },
  },
};

/**
 * Noms des modèles Prisma qui porteront ces données. Quand l'un d'eux apparaît dans `schema.prisma`,
 * un test échoue : il faut alors l'insérer dans les deux profils et le retirer de cette liste.
 */
export const PENDING_MODELS: readonly string[] = [
  "SpecRule",
  "BusinessRule",
  "Rule",
  "Proposal",
  "SpecProposal",
  "Journey",
  "SpecJourney",
  "SampleSet",
  "SampleRow",
];
