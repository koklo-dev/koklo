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
  /** Jeux d'exemple `data/fixtures/FX-*.yaml` indexés (TK-107, B383) ; le premier génère 1 240 (planche) ou 5 000 (large) lignes (TK-110, B488). */
  fixtures: number;
  /** Composants d'architecture `architecture/components/*.yaml` indexés (TK-111, B515). */
  components: number;
  /** Propositions d'un lancement terminé de l'architecture (TK-111) : 80 sur la planche, aucune sur `large`. */
  architectureProposals: number;
  /** Flux d'architecture `architecture/flows/P-flux-*.yaml` indexés (TK-112) : 18 sur la planche, 300 sur `large`. */
  archflows: number;
  /** Décisions d'architecture `architecture/adr/ADR-*.md` indexées (TK-113) : 23 sur la planche, 300 sur `large`. */
  adrs: number;
  /** Cahier technique (TK-115, B736) : choix de la stack, opérations `zone.verbe`, exigences et environnements. */
  stacks: number;
  operations: number;
  nfrs: number;
  environments: number;
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
    fixtures: 2,
    components: 120,
    architectureProposals: 0,
    archflows: 300,
    adrs: 300,
    stacks: 300,
    operations: 500,
    nfrs: 200,
    environments: 3,
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
    fixtures: 2,
    // Six zones de la planche (9, 4, 6, 7, 3 et 5 composants) ; 34 composants + 18 flux + 12 décisions + 16 sections à relire.
    components: 34,
    architectureProposals: 80,
    archflows: 18,
    adrs: 23,
    stacks: 24,
    operations: 132,
    nfrs: 28,
    environments: 3,
  },
};

/** Volume d'un type de donnée dont le modèle n'existe pas encore, et le ticket qui le créera. */
export interface PendingVolume {
  count: number;
  ticket: string;
}

type PendingProfile = Record<string, PendingVolume>;

/**
 * Volumes demandés par les passations pour des modèles absents du schéma : déclarés, jamais insérés
 * (lecture prudente, B34). Chaque ticket d'accueil devra étendre `seed:large` / `seed:planche`.
 */
export const PENDING_VOLUMES: Record<VolumeProfile, PendingProfile> = {
  large: {},
  // TK-110 : les 1 240 lignes d'exemple de la planche sont générées (bloc `generation` de FX-table-001), plus déclarées.
  planche: {},
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
