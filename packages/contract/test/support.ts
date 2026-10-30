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
