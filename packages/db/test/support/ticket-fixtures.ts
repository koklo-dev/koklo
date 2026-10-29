import { randomUUID } from "node:crypto";
import pg from "pg";
import type { TestDatabase } from "../../src/testing/test-database.ts";

/** Tables ajoutées par TK-28 (contrat de la migration `*_tickets_sprints_leases`). */
export const TICKET_TABLES = [
  "tickets",
  "ticket_labels",
  "ticket_features",
  "acceptance_criteria",
  "ticket_dependencies",
  "sprints",
  "project_states",
  "leases",
  "ticket_comments",
  "audit_log",
  "project_counters",
] as const;

/** Modèles Prisma correspondants, tous multi-tenant (portent `organization_id`). */
export const TICKET_MODELS = [
  "Ticket",
  "TicketLabel",
  "TicketFeature",
  "AcceptanceCriterion",
  "TicketDependency",
  "Sprint",
  "ProjectState",
  "Lease",
  "TicketComment",
  "AuditLog",
  "ProjectCounter",
] as const;

export interface Scope {
  organizationId: string;
  projectId: string;
}

export async function insertScope(db: TestDatabase, label: string): Promise<Scope> {
  const organizationId = randomUUID();
  const projectId = randomUUID();
  await db.query(
    "INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, $2, $2, now(), now())",
    [organizationId, `org-${label}-${organizationId.slice(0, 8)}`],
  );
  await db.query(
    "INSERT INTO projects (id, organization_id, name, created_at, updated_at) VALUES ($1, $2, $3, now(), now())",
    [projectId, organizationId, `project-${label}`],
  );
  return { organizationId, projectId };
}

export interface TicketOverrides {
  id?: string;
  key?: string;
  status?: string;
  type?: string;
  priority?: string;
  pkg?: string;
  sensitivity?: string;
  attempts?: number;
  reviewRounds?: number;
  estimateHours?: number | null;
}

/** Insère un ticket valide ; chaque colonne NOT NULL est fournie explicitement. */
export async function insertTicket(
  db: Pick<TestDatabase, "query">,
  scope: Scope,
  overrides: TicketOverrides = {},
): Promise<string> {
  const id = overrides.id ?? randomUUID();
  await db.query(
    `INSERT INTO tickets (id, organization_id, project_id, key, title, description, type, status,
       priority, pkg, sensitivity, attempts, review_rounds, estimate_hours, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'Titre', '', $5, $6, $7, $8, $9, $10, $11, $12, now(), now())`,
    [
      id,
      scope.organizationId,
      scope.projectId,
      overrides.key ?? `TK-${Math.floor(Math.random() * 1_000_000) + 1}`,
      overrides.type ?? "task",
      overrides.status ?? "todo",
      overrides.priority ?? "medium",
      overrides.pkg ?? "db",
      overrides.sensitivity ?? "safe",
      overrides.attempts ?? 0,
      overrides.reviewRounds ?? 0,
      overrides.estimateHours === undefined ? null : overrides.estimateHours,
    ],
  );
  return id;
}

export interface SprintOverrides {
  number?: number;
  status?: string;
}

export async function insertSprint(
  db: Pick<TestDatabase, "query">,
  scope: Scope,
  overrides: SprintOverrides = {},
): Promise<string> {
  const id = randomUUID();
  const number = overrides.number ?? Math.floor(Math.random() * 1_000_000) + 1;
  await db.query(
    `INSERT INTO sprints (id, organization_id, project_id, number, key, goal, starts_on, ends_on,
       status, definition_of_done, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'Objectif', '2026-11-02', '2026-11-13', $6, '', now(), now())`,
    [
      id,
      scope.organizationId,
      scope.projectId,
      number,
      `SP-${number}`,
      overrides.status ?? "planned",
    ],
  );
  return id;
}

export interface LeaseOverrides {
  holderKind?: string;
  releasedAt?: string | null;
  expiresAt?: string;
}

export async function insertLease(
  db: Pick<TestDatabase, "query">,
  scope: Scope,
  ticketId: string,
  overrides: LeaseOverrides = {},
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO leases (id, organization_id, ticket_id, holder_kind, holder_id, branch, worktree,
       acquired_at, heartbeat_at, expires_at, ttl_ms, released_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'runner-1', 'feat/tk-28', '/tmp/wt', now(), now(),
       COALESCE($5::timestamptz, now() + interval '15 minutes'), 900000, $6::timestamptz, now(), now())`,
    [
      id,
      scope.organizationId,
      ticketId,
      overrides.holderKind ?? "runner",
      overrides.expiresAt ?? null,
      overrides.releasedAt ?? null,
    ],
  );
  return id;
}

export async function insertProjectState(
  db: Pick<TestDatabase, "query">,
  scope: Scope,
  version = 1,
  content = "{}",
): Promise<void> {
  await db.query(
    `INSERT INTO project_states (id, organization_id, project_id, version, content, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, now(), now())`,
    [randomUUID(), scope.organizationId, scope.projectId, version, content],
  );
}

export async function insertCounter(
  db: Pick<TestDatabase, "query">,
  scope: Scope,
  name = "ticket",
  lastValue = 0,
): Promise<void> {
  await db.query(
    `INSERT INTO project_counters (organization_id, project_id, name, last_value, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now())`,
    [scope.organizationId, scope.projectId, name, lastValue],
  );
}

export async function insertAudit(
  db: Pick<TestDatabase, "query">,
  scope: Scope,
  action = "ticket.created",
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO audit_log (id, organization_id, actor_kind, actor_id, action, target_kind, target_id, occurred_at)
     VALUES ($1, $2, 'system', NULL, $3, 'ticket', $4, now())`,
    [id, scope.organizationId, action, randomUUID()],
  );
  return id;
}

/** Erreur Postgres attendue : renvoie le SQLSTATE d'une requête qui doit échouer. */
export async function sqlState(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

/** Pool dédié (une connexion par transaction concurrente) ; à fermer par l'appelant. */
export function openPool(url: string, size: number): pg.Pool {
  return new pg.Pool({ connectionString: url, max: size });
}
