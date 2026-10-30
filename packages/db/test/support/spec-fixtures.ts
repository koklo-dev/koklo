import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { TestDatabase } from "../../src/testing/test-database.ts";
import type { Scope } from "./ticket-fixtures.ts";

type Db = Pick<TestDatabase, "query">;

/** Tables multi-tenant ajoutées par TK-41 (portent `organization_id`). */
export const SPEC_TENANT_TABLES = [
  "provider_installations",
  "project_repos",
  "spec_snapshots",
  "spec_heads",
  "spec_features",
  "spec_criteria",
  "spec_tables",
  "spec_endpoints",
  "spec_feature_tables",
  "spec_feature_endpoints",
  "spec_write_batches",
  "spec_write_operations",
] as const;

/** Toutes les tables ajoutées par TK-41 : les 12 multi-tenant + le journal de webhooks. */
export const SPEC_TABLES = [...SPEC_TENANT_TABLES, "webhook_deliveries"] as const;

/** Modèles Prisma correspondants des tables multi-tenant. */
export const SPEC_MODELS = [
  "ProviderInstallation",
  "ProjectRepo",
  "SpecSnapshot",
  "SpecHead",
  "SpecFeature",
  "SpecCriterion",
  "SpecTable",
  "SpecEndpoint",
  "SpecFeatureTable",
  "SpecFeatureEndpoint",
  "SpecWriteBatch",
  "SpecWriteOperation",
] as const;

export const sha = (seed: string = randomUUID()): string =>
  seed.replaceAll("-", "").padEnd(40, "0").slice(0, 40);

export interface InstallationOverrides {
  provider?: string;
  externalId?: string;
  ownerKind?: string;
  status?: string;
}

export async function insertInstallation(
  db: Db,
  scope: Pick<Scope, "organizationId">,
  o: InstallationOverrides = {},
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO provider_installations (id, organization_id, provider, external_id, owner_kind,
       owner_login, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'acme', $6, now(), now())`,
    [
      id,
      scope.organizationId,
      o.provider ?? "github",
      o.externalId ?? String(Math.floor(Math.random() * 1e9)),
      o.ownerKind ?? "organization",
      o.status ?? "active",
    ],
  );
  return id;
}

export interface RepoOverrides {
  role?: string;
  mode?: string;
  externalId?: string;
  specPath?: string | null;
}

export async function insertRepo(
  db: Db,
  scope: Scope,
  installationId: string,
  o: RepoOverrides = {},
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO project_repos (id, organization_id, project_id, installation_id, role, mode,
       external_id, owner_login, name, default_branch, spec_path, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'acme', 'repo', 'main', $8, now(), now())`,
    [
      id,
      scope.organizationId,
      scope.projectId,
      installationId,
      o.role ?? "front",
      o.mode ?? "new",
      o.externalId ?? String(Math.floor(Math.random() * 1e9)),
      o.specPath ?? null,
    ],
  );
  return id;
}

export async function insertSnapshot(
  db: Db,
  scope: Pick<Scope, "organizationId">,
  repoId: string,
  commitSha: string = sha(),
  status = "ready",
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO spec_snapshots (id, organization_id, repo_id, commit_sha, status, indexed_at,
       created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, now(), now(), now())`,
    [id, scope.organizationId, repoId, commitSha, status],
  );
  return id;
}

export async function insertHead(
  db: Db,
  scope: Pick<Scope, "organizationId">,
  repoId: string,
  snapshotId: string,
  branch = "main",
): Promise<void> {
  await db.query(
    `INSERT INTO spec_heads (organization_id, repo_id, branch, snapshot_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now())`,
    [scope.organizationId, repoId, branch, snapshotId],
  );
}

export async function insertFeature(
  db: Db,
  scope: Pick<Scope, "organizationId">,
  snapshotId: string,
  specId = "F-001",
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO spec_features (id, organization_id, snapshot_id, spec_id, title, status, priority,
       file_path, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'Inscription', 'specifiee', 'must', 'features/F-001.md', now(), now())`,
    [id, scope.organizationId, snapshotId, specId],
  );
  return id;
}

export async function insertCriterion(
  db: Db,
  scope: Pick<Scope, "organizationId">,
  featureId: string,
  specId = "AC-1",
  position = 1,
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO spec_criteria (id, organization_id, feature_id, spec_id, position, title,
       created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'Critère', now(), now())`,
    [id, scope.organizationId, featureId, specId, position],
  );
  return id;
}

export async function insertSpecTable(
  db: Db,
  scope: Pick<Scope, "organizationId">,
  snapshotId: string,
  specId = "T-user",
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO spec_tables (id, organization_id, snapshot_id, spec_id, file_path, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'data/tables/user.yaml', now(), now())`,
    [id, scope.organizationId, snapshotId, specId],
  );
  return id;
}

export async function insertEndpoint(
  db: Db,
  scope: Pick<Scope, "organizationId">,
  snapshotId: string,
  specId = "E-register",
  method = "POST",
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO spec_endpoints (id, organization_id, snapshot_id, spec_id, method, path, file_path,
       created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, '/register', 'api/register.yaml', now(), now())`,
    [id, scope.organizationId, snapshotId, specId, method],
  );
  return id;
}

export async function insertFeatureLink(
  db: Db,
  scope: Pick<Scope, "organizationId">,
  link: "spec_feature_tables" | "spec_feature_endpoints",
  featureId: string,
  targetSpecId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO ${link} (organization_id, feature_id, target_spec_id) VALUES ($1, $2, $3)`,
    [scope.organizationId, featureId, targetSpecId],
  );
}

export interface BatchOverrides {
  idempotencyKey?: string;
  status?: string;
  commitSha?: string | null;
  committedAt?: string | null;
  branch?: string;
}

export async function insertBatch(
  db: Db,
  scope: Scope,
  repoId: string,
  o: BatchOverrides = {},
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO spec_write_batches (id, organization_id, project_id, repo_id, branch,
       author_user_id, idempotency_key, base_sha, commit_sha, status, enqueued_at, committed_at,
       created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NULL, $6, NULL, $7, $8, now(), $9::timestamptz, now(), now())`,
    [
      id,
      scope.organizationId,
      scope.projectId,
      repoId,
      o.branch ?? "main",
      o.idempotencyKey ?? randomUUID(),
      o.commitSha === undefined ? null : o.commitSha,
      o.status ?? "queued",
      o.committedAt === undefined ? null : o.committedAt,
    ],
  );
  return id;
}

export async function insertOperation(
  db: Db,
  scope: Pick<Scope, "organizationId">,
  batchId: string,
  o: { position?: number; kind?: string; payload?: string } = {},
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO spec_write_operations (id, organization_id, batch_id, position, kind,
       target_spec_id, payload, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'F-001', $6::jsonb, now(), now())`,
    [
      id,
      scope.organizationId,
      batchId,
      o.position ?? 1,
      o.kind ?? "feature.update",
      o.payload ?? "{}",
    ],
  );
  return id;
}

export interface DeliveryOverrides {
  provider?: string;
  deliveryId?: string;
  event?: string;
  payload?: string;
  status?: string;
}

export const DELIVERY_SQL = `INSERT INTO webhook_deliveries (id, provider, delivery_id, event, payload,
    status, attempts, received_at, created_at, updated_at)
  VALUES ($1, $2, $3, $4, $5::jsonb, $6, 0, now(), now(), now())`;

export function deliveryParams(o: DeliveryOverrides = {}): unknown[] {
  return [
    randomUUID(),
    o.provider ?? "github",
    o.deliveryId ?? randomUUID(),
    o.event ?? "push",
    o.payload ?? "{}",
    o.status ?? "received",
  ];
}

export async function insertDelivery(db: Db, o: DeliveryOverrides = {}): Promise<void> {
  await db.query(DELIVERY_SQL, deliveryParams(o));
}

/** Insère une arborescence complète (installation -> repo -> snapshot -> features/…, lot -> opérations). */
export async function insertFullTree(db: Db, scope: Scope) {
  const installationId = await insertInstallation(db, scope);
  const repoId = await insertRepo(db, scope, installationId, { role: "spec" });
  const snapshotId = await insertSnapshot(db, scope, repoId);
  await insertHead(db, scope, repoId, snapshotId);
  const featureId = await insertFeature(db, scope, snapshotId);
  await insertCriterion(db, scope, featureId);
  await insertSpecTable(db, scope, snapshotId);
  await insertEndpoint(db, scope, snapshotId);
  await insertFeatureLink(db, scope, "spec_feature_tables", featureId, "T-user");
  await insertFeatureLink(db, scope, "spec_feature_endpoints", featureId, "E-register");
  const batchId = await insertBatch(db, scope, repoId);
  await insertOperation(db, scope, batchId);
  return { installationId, repoId, snapshotId, featureId, batchId };
}

/** Valeurs autorisées d'une colonne : enum Postgres natif, ou à défaut CHECK `col IN (...)`. */
export async function allowedValues(db: Db, table: string, column: string): Promise<string[]> {
  const enumRows = await db.query<{ label: string }>(
    `SELECT e.enumlabel AS label
     FROM information_schema.columns c
     JOIN pg_type t ON t.typname = c.udt_name
     JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE c.table_schema = 'public' AND c.table_name = $1 AND c.column_name = $2`,
    [table, column],
  );
  return enumRows.map((row) => row.label).sort();
}

/** Valeurs d'un `z.enum([...])` de `@koklo/schema`, lues dans sa source (db ne dépend pas de schema). */
export function schemaEnumValues(file: string, field: string): string[] {
  const source = readFileSync(
    new URL(`../../../schema/src/entities/${file}`, import.meta.url),
    "utf8",
  );
  const match = new RegExp(`${field}:\\s*z\\.enum\\(\\[([^\\]]+)\\]\\)`).exec(source);
  if (!match?.[1]) throw new Error(`z.enum introuvable pour ${field} dans ${file}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1] as string).sort();
}
