import type { TestDatabase } from "@koklo/db/testing";

/** Review posée en SQL à une date donnée (impact amont, TK-100 lot C) : cible `deliverable` ou élément du Fonctionnel. */
export const insertReviewAt = (
  database: TestDatabase,
  scene: { organizationId: string; projectId: string; repoId: string },
  authorUserId: string,
  at: Date,
  target: { kind: string; ref: string } = { kind: "deliverable", ref: "functional" },
  status: "approved" | "changes_requested" = "approved",
) =>
  database.query(
    `INSERT INTO reviews (id, organization_id, project_id, repo_id, target_kind, target_ref, sha, status,
                          author_user_id, author_role, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4::review_target_kind, $5, $6, $7::review_status, $8, 'owner', $9, $9)`,
    [
      scene.organizationId,
      scene.projectId,
      scene.repoId,
      target.kind,
      target.ref,
      "a".repeat(40),
      status,
      authorUserId,
      at,
    ],
  );

const DAY = 86_400_000;
/** Un jour avant maintenant (`ago(2)` : deux jours). */
export const ago = (days: number): Date => new Date(Date.now() - days * DAY);
