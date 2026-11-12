import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { type Actor, insertActor } from "./organizations.ts";
import type { RepoBench } from "./repo-scene.ts";
import { readScene, type SpecReadScene } from "./spec-read.ts";
import { createWorld, insertProject, linkClient, send } from "./tickets.ts";

/** Client HTTP des trois procédures `clientSpace.*` du contrat 0.11.0. */
export function clientSpaceApi(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  return {
    projects: () => send(app, cookie, "get", "/client-space/projects"),
    features: (projectId: string, query = "") =>
      send(app, cookie, "get", `/client-space/projects/${projectId}/features${query}`),
    feature: (projectId: string, featureId: string) =>
      send(app, cookie, "get", `/client-space/projects/${projectId}/features/${featureId}`),
    // TK-104 (contrat 3.2.0) : progression, parcours, règles et rôles.
    progress: (projectId: string) =>
      send(app, cookie, "get", `/client-space/projects/${projectId}/progress`),
    flows: (projectId: string, query = "") =>
      send(app, cookie, "get", `/client-space/projects/${projectId}/flows${query}`),
    rules: (projectId: string, query = "") =>
      send(app, cookie, "get", `/client-space/projects/${projectId}/rules${query}`),
    roles: (projectId: string) =>
      send(app, cookie, "get", `/client-space/projects/${projectId}/roles`),
  };
}

/**
 * Scène de l'espace client : l'organisation A a deux projets avec leur dépôt de spec (`p1`, le plus
 * ancien, et `p2`), le client `c1` lié à `p1`, le client `c2` lié à `p2`, le client `c3` sans lien ;
 * l'organisation étrangère a son propre projet indexé et son propriétaire. Les liens sont posés en SQL.
 */
export interface SpaceScene {
  p1: SpecReadScene;
  p2: SpecReadScene;
  c1: Actor;
  c2: Actor;
  c3: Actor;
  foreign: SpecReadScene;
}

export async function createSpaceScene(bench: RepoBench): Promise<SpaceScene> {
  const p1 = await readScene(bench);
  const org = p1.organizationId;
  const p2Id = await insertProject(bench.database, org, "Projet deux", "2026-01-02T00:00:00.000Z");
  const p2 = await readScene(bench, { world: p1.world, projectId: p2Id });
  const c1 = p1.world.actors.client;
  const c2 = await insertActor(bench.database, org, "client", "client2");
  const c3 = await insertActor(bench.database, org, "client", "client3");
  await linkClient(bench.database, org, p1.projectId, c1.userId);
  await linkClient(bench.database, org, p2.projectId, c2.userId);
  const foreign = await readScene(bench, { world: await createWorld(bench.database) });
  return { p1, p2, c1, c2, c3, foreign };
}

export interface ReviewSeed {
  targetRef: string;
  status: "approved" | "changes_requested";
  sha: string;
  targetKind?: "feature" | "baseline";
  authorUserId?: string;
  createdAt?: string;
}

/** Insère une review comme le ferait `review.submit` (55d) : le journal est lu, jamais écrit, par 55b. */
export async function seedReview(
  database: TestDatabase,
  s: SpecReadScene,
  seed: ReviewSeed,
): Promise<string> {
  const id = randomUUID();
  await database.query(
    `INSERT INTO reviews (id, organization_id, project_id, repo_id, target_kind, target_ref, sha, status,
                          author_user_id, author_role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::review_target_kind, $6, $7, $8::review_status, $9, 'client',
             COALESCE($10::timestamptz, now()), now())`,
    [
      id,
      s.organizationId,
      s.projectId,
      s.repoId,
      seed.targetKind ?? "feature",
      seed.targetRef,
      seed.sha,
      seed.status,
      seed.authorUserId ?? s.world.actors.client.userId,
      seed.createdAt ?? null,
    ],
  );
  return id;
}

/** Suggestion ouverte (ou décidée) sur une feature, posée en SQL (le lot 55c écrira par l'API). */
export async function seedSuggestion(
  database: TestDatabase,
  s: SpecReadScene,
  seed: { key: string; targetRef: string; status?: "open" | "accepted" | "rejected" | "withdrawn" },
): Promise<void> {
  const status = seed.status ?? "open";
  await database.query(
    `INSERT INTO suggestions (id, organization_id, project_id, key, target_kind, target_ref, body, author_user_id,
                              author_role, status, decided_by_user_id, decided_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'feature', $5, 'Une idée', $6, 'client', $7::suggestion_status,
             $8, $9, now(), now())`,
    [
      randomUUID(),
      s.organizationId,
      s.projectId,
      seed.key,
      seed.targetRef,
      s.world.actors.client.userId,
      status,
      status === "open" ? null : s.world.actors.owner.userId,
      status === "open" ? null : new Date().toISOString(),
    ],
  );
}

/** `baseline-0` taguée : le projet passe de la phase « framing » à « iteration ». */
export async function seedTaggedBaseline(
  database: TestDatabase,
  s: SpecReadScene,
  sha: string,
): Promise<void> {
  const reviewId = await seedReview(database, s, {
    targetRef: "baseline-0",
    targetKind: "baseline",
    status: "approved",
    sha,
  });
  await database.query(
    `INSERT INTO baselines (id, organization_id, project_id, repo_id, number, status, proposed_sha,
                            review_id, validated_at, tag_sha, tagged_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 0, 'tagged', $5, $6, now(), $5, now(), now(), now())`,
    [randomUUID(), s.organizationId, s.projectId, s.repoId, sha, reviewId],
  );
}
