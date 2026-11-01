import { randomUUID } from "node:crypto";
import type { TestDatabase } from "../../src/testing/test-database.ts";
import { insertInstallation, insertRepo } from "./spec-fixtures.ts";
import { insertScope, type Scope } from "./ticket-fixtures.ts";

/** Tables ajoutées par TK-51c (validations client liées au SHA, baselines). */
export const REVIEW_TABLES = ["reviews", "baselines"] as const;
export const REVIEW_MODELS = ["Review", "Baseline"] as const;

export const REVIEW_SUFFIX = "_reviews_baselines";
export const REVIEW_MIGRATION = "20261101110000_reviews_baselines";

/** Valeurs d'enum attendues (ordre de déclaration). */
export const REVIEW_TARGET_KINDS = ["feature", "screen", "baseline"] as const;
export const REVIEW_STATUSES = ["approved", "changes_requested"] as const;
export const BASELINE_STATUSES = ["proposed", "validated", "tagged"] as const;

/** Colonnes exactes (`udt_name/is_nullable`). Auteur et proposant sans FK users (preuve conservée). */
export const REVIEW_COLUMNS = {
  author_role: "text/YES",
  author_user_id: "uuid/NO",
  comment: "text/YES",
  created_at: "timestamptz/NO",
  id: "uuid/NO",
  organization_id: "uuid/NO",
  project_id: "uuid/NO",
  repo_id: "uuid/NO",
  sha: "text/NO",
  status: "review_status/NO",
  target_kind: "review_target_kind/NO",
  target_ref: "text/NO",
  updated_at: "timestamptz/NO",
} as const;

export const BASELINE_COLUMNS = {
  created_at: "timestamptz/NO",
  id: "uuid/NO",
  number: "int4/NO",
  organization_id: "uuid/NO",
  project_id: "uuid/NO",
  proposed_by_user_id: "uuid/YES",
  proposed_sha: "text/NO",
  repo_id: "uuid/NO",
  review_id: "uuid/YES",
  status: "baseline_status/NO",
  tag_sha: "text/YES",
  tagged_at: "timestamptz/YES",
  updated_at: "timestamptz/NO",
  validated_at: "timestamptz/YES",
} as const;

export const SHA40 = "a".repeat(40);
export const SHA64 = "b".repeat(64);
export const WHEN = "2026-11-02T10:00:00Z";

/** Périmètre d'un projet avec un repo de spec (les deux tables portent `repo_id`). */
export interface ReviewScope extends Scope {
  repoId: string;
  installationId: string;
}

export async function reviewScope(db: TestDatabase, label: string): Promise<ReviewScope> {
  const scope = await insertScope(db, label);
  const installationId = await insertInstallation(db, scope);
  const repoId = await insertRepo(db, scope, installationId, { role: "spec" });
  return { ...scope, installationId, repoId };
}

/** Un second projet de la même organisation, avec son propre repo. */
export async function secondProject(db: TestDatabase, scope: ReviewScope): Promise<ReviewScope> {
  const projectId = randomUUID();
  await db.query(
    "INSERT INTO projects (id, organization_id, name, created_at, updated_at) VALUES ($1, $2, 'second', now(), now())",
    [projectId, scope.organizationId],
  );
  const next: Scope = { organizationId: scope.organizationId, projectId };
  const repoId = await insertRepo(db, next, scope.installationId, { role: "spec" });
  return { ...next, installationId: scope.installationId, repoId };
}

export interface ReviewOverrides {
  id?: string;
  organizationId?: string;
  projectId?: string;
  repoId?: string;
  targetKind?: string;
  targetRef?: string;
  sha?: string;
  status?: string;
  authorUserId?: string | null;
  authorRole?: string | null;
  comment?: string | null;
}

const pick = <T>(value: T | undefined, fallback: T): T => (value === undefined ? fallback : value);

/** Insère une review valide (feature F-001, approuvée) ; chaque colonne est fournie explicitement. */
export async function insertReview(
  db: Pick<TestDatabase, "query">,
  scope: ReviewScope,
  o: ReviewOverrides = {},
): Promise<string> {
  const id = o.id ?? randomUUID();
  await db.query(
    `INSERT INTO reviews (id, organization_id, project_id, repo_id, target_kind, target_ref, sha,
       status, author_user_id, author_role, comment, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::review_target_kind, $6, $7, $8::review_status, $9, $10, $11,
       now(), now())`,
    [
      id,
      o.organizationId ?? scope.organizationId,
      o.projectId ?? scope.projectId,
      o.repoId ?? scope.repoId,
      o.targetKind ?? "feature",
      o.targetRef ?? "F-001",
      o.sha ?? SHA40,
      o.status ?? "approved",
      pick(o.authorUserId, randomUUID()),
      pick(o.authorRole, "client"),
      pick(o.comment, null),
    ],
  );
  return id;
}

export interface BaselineOverrides {
  id?: string;
  organizationId?: string;
  projectId?: string;
  repoId?: string;
  number?: number;
  status?: string;
  proposedSha?: string;
  proposedByUserId?: string | null;
  reviewId?: string | null;
  validatedAt?: string | null;
  tagSha?: string | null;
  taggedAt?: string | null;
}

/** Insère une baseline `proposed` valide (numéro 0 par défaut) ; fournir les champs de l'état voulu. */
export async function insertBaseline(
  db: Pick<TestDatabase, "query">,
  scope: ReviewScope,
  o: BaselineOverrides = {},
): Promise<string> {
  const id = o.id ?? randomUUID();
  await db.query(
    `INSERT INTO baselines (id, organization_id, project_id, repo_id, number, status, proposed_sha,
       proposed_by_user_id, review_id, validated_at, tag_sha, tagged_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::baseline_status, $7, $8, $9, $10, $11, $12, now(), now())`,
    [
      id,
      o.organizationId ?? scope.organizationId,
      o.projectId ?? scope.projectId,
      o.repoId ?? scope.repoId,
      o.number ?? 0,
      o.status ?? "proposed",
      o.proposedSha ?? SHA40,
      pick(o.proposedByUserId, null),
      pick(o.reviewId, null),
      pick(o.validatedAt, null),
      pick(o.tagSha, null),
      pick(o.taggedAt, null),
    ],
  );
  return id;
}
