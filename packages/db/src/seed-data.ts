/** Identifiants fixes du jeu de démo : stables d'une exécution à l'autre et d'un poste à l'autre. */
export const SEED_IDS = {
  organization: "01900000-0000-7000-8000-000000000001",
  adminUser: "01900000-0000-7000-8000-000000000002",
  clientUser: "01900000-0000-7000-8000-000000000003",
  adminMember: "01900000-0000-7000-8000-000000000004",
  clientMember: "01900000-0000-7000-8000-000000000005",
  project: "01900000-0000-7000-8000-000000000006",
  sprint: "01900000-0000-7000-8000-0000000000a1",
} as const;

/** Horodatage fixe : le seed n'utilise jamais l'horloge, sinon deux exécutions diffèrent. */
export const SEED_DATE = "2026-01-01T00:00:00.000Z";

const ID_PREFIX = "01900000-0000-7000-8000-";
const hex2 = (n: number): string => n.toString(16).padStart(2, "0");

/** Id du ticket `TK-n` : `…0000000001NN` (NN = n en hexadécimal sur deux chiffres). */
export const ticketSeedId = (n: number): string => `${ID_PREFIX}0000000001${hex2(n)}`;

/** Id du critère `position` du ticket `n` : `…00000002<TT><PP>`. */
export const criterionSeedId = (n: number, position: number): string =>
  `${ID_PREFIX}00000002${hex2(n)}${hex2(position)}`;

/**
 * Spec fictive (CDC §18.3, annexe A) : constante typée, aucune table ne la porte avant TK-41.
 * Elle sert de référent à `ticket_features.feature_ref` et `acceptance_criteria.spec_ref`.
 */
export interface DemoSpec {
  features: readonly {
    id: string;
    title: string;
    priority: "must" | "should";
    acceptanceCriteria: readonly { id: string; statement: string }[];
    tables: readonly string[];
  }[];
  tables: readonly {
    id: string;
    columns: readonly { name: string; type?: string }[];
  }[];
}

export const DEMO_SPEC: DemoSpec = {
  features: [
    {
      id: "F-001",
      title: "Inscription par email",
      priority: "must",
      acceptanceCriteria: [
        { id: "AC-1", statement: "Un visiteur crée un compte avec un email valide" },
        { id: "AC-2", statement: "Un email déjà utilisé est refusé" },
      ],
      tables: ["T-user"],
    },
    {
      id: "F-002",
      title: "Connexion",
      priority: "must",
      acceptanceCriteria: [
        { id: "AC-1", statement: "Un utilisateur inscrit se connecte et obtient une session" },
      ],
      tables: ["T-user", "T-session"],
    },
    {
      id: "F-003",
      title: "Profil utilisateur",
      priority: "should",
      acceptanceCriteria: [{ id: "AC-1", statement: "Un utilisateur modifie son nom affiché" }],
      tables: ["T-user"],
    },
  ],
  tables: [
    {
      id: "T-user",
      columns: [
        { name: "id", type: "uuid" },
        { name: "email", type: "text" },
        { name: "name", type: "text" },
        { name: "created_at", type: "timestamptz" },
      ],
    },
    {
      id: "T-session",
      columns: [
        { name: "id", type: "uuid" },
        { name: "user_id", type: "uuid" },
        { name: "expires_at", type: "timestamptz" },
      ],
    },
  ],
};

export const SEED_SPRINT = {
  number: 1,
  key: "SP-1",
  status: "active",
  goal: "Livrer le parcours d'inscription et de connexion",
  definitionOfDone: "Tests verts, revue approuvée et documentation à jour",
  startsOn: "2026-01-05",
  endsOn: "2026-01-16",
} as const;

export interface SeedTicket {
  number: number;
  title: string;
  description: string;
  type: "feature" | "task";
  status: "backlog" | "todo" | "in_progress" | "in_review" | "done";
  priority: "low" | "medium" | "high" | "critical";
  pkg: "db" | "domain" | "api" | "web" | "e2e";
  sensitivity: "safe" | "sensitive";
  estimateHours: number;
  reviewRounds: number;
  branch: string | null;
  pullRequest: string | null;
  features: readonly string[];
  /** Numéros des tickets dont celui-ci dépend (`blocks`). */
  blockedBy: readonly number[];
  /** Numéros des tickets liés (`related`). */
  related: readonly number[];
  criteria: readonly { statement: string; specRef: string }[];
}

const base = { reviewRounds: 0, branch: null, pullRequest: null, related: [] } as const;

export const SEED_TICKETS: readonly SeedTicket[] = [
  {
    ...base,
    number: 1,
    title: "Table users et migration",
    description: "Créer la table des utilisateurs et sa migration.",
    type: "task",
    status: "done",
    priority: "high",
    pkg: "db",
    sensitivity: "sensitive",
    estimateHours: 3,
    features: ["F-001"],
    blockedBy: [],
    criteria: [{ statement: "La colonne email est unique", specRef: "T-user.email" }],
  },
  {
    ...base,
    number: 2,
    title: "Règles de mot de passe et d'email",
    description: "Valider la forme de l'email et la robustesse du mot de passe.",
    type: "feature",
    status: "done",
    priority: "medium",
    pkg: "domain",
    sensitivity: "safe",
    estimateHours: 2,
    features: ["F-001"],
    blockedBy: [],
    criteria: [
      { statement: "Un email mal formé est refusé", specRef: "F-001#AC-1" },
      { statement: "Un email déjà utilisé est refusé", specRef: "F-001#AC-2" },
    ],
  },
  {
    ...base,
    number: 3,
    title: "Endpoint d'inscription",
    description: "Exposer la création de compte via l'API.",
    type: "feature",
    status: "in_review",
    priority: "high",
    pkg: "api",
    sensitivity: "safe",
    estimateHours: 5,
    reviewRounds: 1,
    branch: "feat/tk-3-inscription",
    pullRequest: "https://example.test/demo/pull/3",
    features: ["F-001"],
    blockedBy: [1, 2],
    criteria: [{ statement: "L'inscription renvoie le compte créé", specRef: "F-001#AC-1" }],
  },
  {
    ...base,
    number: 4,
    title: "Endpoint de connexion",
    description: "Ouvrir une session pour un utilisateur inscrit.",
    type: "feature",
    status: "in_progress",
    priority: "critical",
    pkg: "api",
    sensitivity: "safe",
    estimateHours: 4,
    features: ["F-002"],
    blockedBy: [1],
    related: [2],
    criteria: [{ statement: "La connexion crée une session", specRef: "F-002#AC-1" }],
  },
  {
    ...base,
    number: 5,
    title: "Écran d'inscription",
    description: "Formulaire d'inscription dans l'application web.",
    type: "feature",
    status: "todo",
    priority: "medium",
    pkg: "web",
    sensitivity: "safe",
    estimateHours: 6,
    features: ["F-001"],
    blockedBy: [3],
    criteria: [{ statement: "Le formulaire affiche les erreurs de saisie", specRef: "F-001#AC-1" }],
  },
  {
    ...base,
    number: 6,
    title: "Parcours e2e inscription puis connexion",
    description: "Vérifier le parcours complet dans un vrai navigateur.",
    type: "task",
    status: "backlog",
    priority: "low",
    pkg: "e2e",
    sensitivity: "safe",
    estimateHours: 3,
    features: ["F-001", "F-002"],
    blockedBy: [3, 4, 5],
    criteria: [{ statement: "Inscription puis connexion réussissent", specRef: "F-002#AC-1" }],
  },
];
