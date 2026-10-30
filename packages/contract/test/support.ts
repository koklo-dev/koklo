import { contract } from "../src/index.ts";

export type StandardLike = {
  "~standard": { validate(v: unknown): unknown | Promise<unknown> };
};
export type Procedure = {
  "~orpc": {
    inputSchemas?: StandardLike[];
    outputSchemas?: StandardLike[];
    errorMap?: Record<string, { status?: number; data?: StandardLike }>;
  };
};

/** Résout `groupe.procédure` (ou `health`) dans le routeur, sans présumer qu'elle existe. */
export const proc = (path: string): Procedure | undefined => {
  let node: unknown = contract;
  for (const part of path.split(".")) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  return node as Procedure | undefined;
};

export const input = (path: string) => proc(path)?.["~orpc"].inputSchemas?.[0];
export const output = (path: string) => proc(path)?.["~orpc"].outputSchemas?.[0];
export const errors = (path: string) => proc(path)?.["~orpc"].errorMap ?? {};

const validate = async (schema: StandardLike | undefined, value: unknown) => {
  if (!schema) throw new Error("schema manquant : la procédure n'existe pas encore");
  return (await schema["~standard"].validate(value)) as { issues?: unknown[]; value?: unknown };
};
export const isValid = async (schema: StandardLike | undefined, value: unknown) =>
  (await validate(schema, value)).issues === undefined;

/** Valeur après validation (undefined si rejetée) : sert à prouver qu'un champ n'est jamais conservé. */
export const parsed = async (schema: StandardLike | undefined, value: unknown) => {
  const result = await validate(schema, value);
  return result.issues === undefined ? (result.value as Record<string, unknown>) : undefined;
};

export const UUID = "123e4567-e89b-42d3-a456-426614174000";
export const UUID2 = "223e4567-e89b-42d3-a456-426614174001";
export const INSTANT = "2026-11-04T10:00:00.000Z";

export const BAD_TICKET_KEYS = ["TK-0", "tk-1", "TK-1a", "TK-01", "1", "", "SP-1"];
export const BAD_SPRINT_KEYS = ["SP-0", "sp-1", "SP-1a", "SP-01", "1", "", "TK-1"];

export const STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
  "cancelled",
];
export const TYPES = ["feature", "bug", "task", "chore"];
export const PRIORITIES = ["low", "medium", "high", "critical"];
export const PACKAGES = [
  "web",
  "api",
  "worker",
  "contract",
  "db",
  "domain",
  "schema",
  "github",
  "rules",
  "delivery",
  "cli",
  "ui",
  "config",
  "e2e",
  "infra",
];

export const ticket = {
  id: UUID,
  key: "TK-29",
  title: "Contrat tickets",
  description: "",
  type: "feature",
  status: "backlog",
  priority: "medium",
  sprint: null,
  assignee: null,
  pkg: "contract",
  labels: [],
  sensitivity: "safe",
  estimateHours: null,
  linkedFeatures: [],
  branch: null,
  pullRequest: null,
  attempts: 0,
  reviewRounds: 0,
  createdAt: INSTANT,
};

export const lease = {
  ticket: "TK-29",
  holder: { kind: "runner", id: "R1" },
  branch: "feat/tk-29",
  worktree: "/work/tk-29",
  acquiredAt: INSTANT,
  heartbeatAt: INSTANT,
  expiresAt: "2026-11-04T10:15:00.000Z",
  ttlMs: 900_000,
  released: false,
};

export const sprint = {
  id: UUID,
  key: "SP-1",
  goal: "Livrer le contrat",
  status: "planned",
  startsOn: "2026-11-02",
  endsOn: "2026-11-13",
  definitionOfDone: "",
};

export const comment = {
  id: UUID,
  targetKind: "ticket",
  targetId: UUID2,
  authorKind: "human",
  authorId: UUID2,
  body: "Un commentaire",
  createdAt: INSTANT,
};

export const auditEntry = {
  id: UUID,
  actorKind: "human",
  action: "ticket.transition",
  targetKind: "ticket",
  targetId: UUID2,
  occurredAt: INSTANT,
};

// --- TK-42 : contrat 0.5.0 (fournisseur, spec, lots d'écriture) ---
export const SHA = "0123456789abcdef0123456789abcdef01234567";
export const SHA2 = "fedcba9876543210fedcba9876543210fedcba98";

export const installation = {
  id: UUID,
  provider: "github",
  ownerKind: "organization",
  ownerLogin: "koklo-hq",
  status: "active",
  userAuthorization: "absent",
  createdAt: INSTANT,
};

export const repo = {
  id: UUID,
  projectId: UUID2,
  installationId: UUID,
  role: "spec",
  mode: "new",
  ownerLogin: "koklo-hq",
  name: "demo-spec",
  defaultBranch: "main",
  specPath: null,
};

export const specHead = {
  branch: "cadrage",
  commitSha: SHA,
  status: "ready",
  errorCode: null,
  indexedAt: INSTANT,
  counts: { features: 3, tables: 2, endpoints: 4 },
};

export const featureSummary = {
  specId: "F-001",
  title: "Connexion",
  status: "brouillon",
  priority: "must",
  filePath: "features/F-001.md",
  criteriaCount: 2,
};

export const featureDetail = {
  specId: "F-001",
  title: "Connexion",
  status: "specifiee",
  priority: "should",
  description: "Se connecter par lien magique.",
  criteria: [
    {
      specId: "AC-1",
      position: 1,
      title: "Lien envoyé",
      steps: [
        { type: "etant_donne", text: "un compte" },
        { type: "quand", text: "je demande un lien" },
        { type: "alors", text: "un courriel part" },
        { type: "et", text: "le lien expire" },
      ],
    },
  ],
  tables: ["T-user"],
  endpoints: ["E-login"],
  screens: ["S-login"],
  roles: ["RL-owner"],
  rules: ["R-001"],
  nfr: ["NFR-perf"],
  filePath: "features/F-001.md",
  commitSha: SHA,
};

export const report = {
  ok: false,
  counts: { error: 1, warning: 1 },
  truncated: false,
  issues: [
    {
      rule: 4,
      code: "R4_UNKNOWN_TABLE",
      severity: "error",
      path: "features/F-001.md",
      pointer: "/tables/0",
      entityId: "F-001",
      message: "table inconnue",
    },
    {
      rule: "structure",
      code: "STRUCT_SCHEMA_VIOLATION",
      severity: "warning",
      path: "features/F-002.md",
      pointer: "",
      message: "structure",
    },
  ],
};

export const batch = {
  id: UUID,
  branch: "cadrage",
  status: "queued",
  idempotencyKey: "submit-1",
  baseSha: null,
  commitSha: null,
  errorCode: null,
  report: null,
  results: [{ position: 0, kind: "feature.create", specId: null }],
  enqueuedAt: INSTANT,
  committedAt: null,
};

export const createOp = { kind: "feature.create", title: "Nouvelle feature", priority: "must" };
export const submitInput = {
  projectId: UUID,
  idempotencyKey: "submit-1",
  operations: [createOp],
};
