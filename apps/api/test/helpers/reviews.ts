import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { type Actor, insertActor } from "./organizations.ts";
import type { RepoBench } from "./repo-scene.ts";
import { type FeatureSeed, type SpecReadScene, seedIndex } from "./spec-read.ts";
import { createSuggestionScene, type SuggestionScene } from "./suggestions.ts";
import { linkClient, send } from "./tickets.ts";

/**
 * Client HTTP des deux procédures `review.*` du contrat 0.13.0 (fixé par .workflow/TK-55d/03-red.md) :
 *  - submit POST /projects/{projectId}/reviews { targetKind, targetRef, version, status, comment? }
 *  - list   GET  /projects/{projectId}/reviews?targetKind&targetRef&limit&cursor
 * `version` est le jeton opaque que le client a lu (en pratique le SHA de la tête de spec).
 */
export function reviewApi(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  const base = (projectId: string) => `/projects/${projectId}/reviews`;
  return {
    submit: (projectId: string, version: string, over: Record<string, unknown> = {}) =>
      send(app, cookie, "post", base(projectId), {
        projectId,
        targetKind: "feature",
        targetRef: "F-001",
        version,
        status: "approved",
        ...over,
      }),
    submitBaseline: (projectId: string, version: string, over: Record<string, unknown> = {}) =>
      send(app, cookie, "post", base(projectId), {
        projectId,
        targetKind: "baseline",
        targetRef: "baseline-0",
        version,
        status: "approved",
        ...over,
      }),
    list: (projectId: string, query = "") => send(app, cookie, "get", `${base(projectId)}${query}`),
  };
}

export interface ReviewRow {
  id: string;
  organization_id: string;
  project_id: string;
  repo_id: string;
  target_kind: string;
  target_ref: string;
  sha: string;
  status: string;
  author_user_id: string;
  author_role: string | null;
  comment: string | null;
  created_at: Date;
}

/** Journal des reviews d'un projet, de la plus ancienne à la plus récente. */
export function reviewRows(database: TestDatabase, projectId: string) {
  return database.query<ReviewRow>(
    `SELECT id, organization_id, project_id, repo_id, target_kind, target_ref, sha, status,
            author_user_id, author_role, comment, created_at
       FROM reviews WHERE project_id = $1 ORDER BY created_at, id`,
    [projectId],
  );
}

export interface BaselineRow {
  id: string;
  project_id: string;
  repo_id: string;
  number: number;
  status: string;
  proposed_sha: string;
  review_id: string | null;
  validated_at: Date | null;
  tag_sha: string | null;
}

export function baselineRows(database: TestDatabase, projectId: string) {
  return database.query<BaselineRow>(
    `SELECT id, project_id, repo_id, number, status, proposed_sha, review_id, validated_at, tag_sha
       FROM baselines WHERE project_id = $1 ORDER BY number`,
    [projectId],
  );
}

/** Baseline `proposed` (ce que fera TK-56) : le projet est en cadrage, `proposed_sha` figé. */
export async function seedProposedBaseline(
  database: TestDatabase,
  s: SpecReadScene,
  proposedSha: string,
  number = 0,
): Promise<string> {
  const id = randomUUID();
  await database.query(
    `INSERT INTO baselines (id, organization_id, project_id, repo_id, number, status, proposed_sha,
                            created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'proposed', $6, now(), now())`,
    [id, s.organizationId, s.projectId, s.repoId, number, proposedSha],
  );
  return id;
}

export interface ReviewScene extends SuggestionScene {
  /** Second client lié à p1 (un projet = un client en pratique, mais rien ne l'interdit). */
  c4: Actor;
}

/**
 * Scène de validation : celle des suggestions (p1 F-001 et F-002, p2 F-009, projet étranger F-001,
 * clients c1 lié à p1, c2 lié à p2, c3 sans lien) plus un second client c4 lié à p1.
 */
export async function createReviewScene(bench: RepoBench): Promise<ReviewScene> {
  const scene = await createSuggestionScene(bench);
  const c4 = await insertActor(bench.database, scene.p1.organizationId, "client", "client4");
  await linkClient(bench.database, scene.p1.organizationId, scene.p1.projectId, c4.userId);
  return { ...scene, c4 };
}

/** Fait avancer la tête de spec de `s` (nouveau commit indexé) : l'ancienne version devient périmée. */
export async function advanceHead(
  bench: RepoBench,
  s: SpecReadScene,
  features: FeatureSeed[],
): Promise<string> {
  return (await seedIndex(bench, s, features, { commit: true })).sha;
}

export const P1_FEATURES: FeatureSeed[] = [
  { id: "F-001", titre: "Connexion" },
  { id: "F-002", titre: "Profil" },
];

/** Nombre de lignes de `notifications` d'une organisation (les écritures n'en laissent pas en cas de refus). */
export async function notificationTotal(
  database: TestDatabase,
  organizationId: string,
): Promise<number> {
  const rows = await database.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM notifications WHERE organization_id = $1",
    [organizationId],
  );
  return rows[0]?.n ?? 0;
}

export async function reviewTotal(database: TestDatabase, organizationId: string): Promise<number> {
  const rows = await database.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM reviews WHERE organization_id = $1",
    [organizationId],
  );
  return rows[0]?.n ?? 0;
}
