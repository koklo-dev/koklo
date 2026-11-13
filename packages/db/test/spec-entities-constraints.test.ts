import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { insertReview, type ReviewScope, reviewScope } from "./support/reviews-fixtures.ts";
import { insertSnapshot } from "./support/spec-fixtures.ts";
import { sqlState } from "./support/ticket-fixtures.ts";

/** TK-100 (lot B) : contraintes de `spec_entities` et de `review_versions`, immuabilité du journal inchangée. */
const CHECK = "23514";
const UNIQUE = "23505";
const FOREIGN_KEY = "23503";
const RESTRICT = "23001";
const HASH = "a".repeat(64);

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
}, 180_000);
afterAll(async () => {
  await db?.dispose();
}, 60_000);

const entity = (
  scope: ReviewScope,
  snapshotId: string,
  over: {
    kind?: string;
    specId?: string;
    hash?: string;
    organizationId?: string;
    sort?: number;
  } = {},
) =>
  db.query(
    `INSERT INTO spec_entities (id, organization_id, snapshot_id, kind, spec_id, zone, path, data, content_hash, sort, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'functional', 'features/F-001.md', '{"titre":"Inscription"}'::jsonb, $6, $7, now(), now())`,
    [
      randomUUID(),
      over.organizationId ?? scope.organizationId,
      snapshotId,
      over.kind ?? "feature",
      over.specId ?? "F-001",
      over.hash ?? HASH,
      over.sort ?? 0,
    ],
  );

describe("spec_entities : contraintes", () => {
  it("accepte chacun des genres du modèle", async () => {
    const scope = await reviewScope(db, "se-a");
    const snapshot = await insertSnapshot(db, scope, scope.repoId);
    for (const kind of [
      "feature",
      "rule",
      "roles",
      "flow",
      "relations",
      "table",
      "fixture",
      "endpoint",
      "screen",
      "test",
    ]) {
      expect(
        await sqlState(() => entity(scope, snapshot, { kind, specId: `X-${kind}` })),
        kind,
      ).toBeUndefined();
    }
  });

  it("refuse un genre hors liste, un hachage mal formé (23514)", async () => {
    const scope = await reviewScope(db, "se-b");
    const snapshot = await insertSnapshot(db, scope, scope.repoId);
    expect(await sqlState(() => entity(scope, snapshot, { kind: "layout" }))).toBe(CHECK);
    expect(await sqlState(() => entity(scope, snapshot, { hash: "xyz" }))).toBe(CHECK);
  });

  it("refuse un doublon (snapshot, genre, identifiant) (23505), accepte un autre genre", async () => {
    const scope = await reviewScope(db, "se-c");
    const snapshot = await insertSnapshot(db, scope, scope.repoId);
    await entity(scope, snapshot);
    expect(await sqlState(() => entity(scope, snapshot))).toBe(UNIQUE);
    expect(await sqlState(() => entity(scope, snapshot, { kind: "flow" }))).toBeUndefined();
  });
});

describe("spec_entities : clé composite, cascade et recherche", () => {
  it("refuse une organisation qui n'est pas celle du snapshot (23503) ; la suppression du snapshot emporte les entités", async () => {
    const scope = await reviewScope(db, "se-d");
    const other = await reviewScope(db, "se-d2");
    const snapshot = await insertSnapshot(db, scope, scope.repoId);
    expect(
      await sqlState(() => entity(scope, snapshot, { organizationId: other.organizationId })),
    ).toBe(FOREIGN_KEY);
    await entity(scope, snapshot);
    await db.query("DELETE FROM spec_snapshots WHERE id = $1", [snapshot]);
    const [row] = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM spec_entities WHERE snapshot_id = $1",
      [snapshot],
    );
    expect(row?.n).toBe("0");
  });

  it("la recherche plein texte couvre l'identifiant et le titre", async () => {
    const scope = await reviewScope(db, "se-e");
    const snapshot = await insertSnapshot(db, scope, scope.repoId);
    await entity(scope, snapshot);
    const rows = await db.query(
      "SELECT 1 FROM spec_entities WHERE snapshot_id = $1 AND search @@ to_tsquery('french', 'inscription')",
      [snapshot],
    );
    expect(rows).toHaveLength(1);
  });
});

const version = (
  scope: ReviewScope,
  reviewId: string,
  over: { hash?: string; organizationId?: string } = {},
) =>
  db.query(
    `INSERT INTO review_versions (id, organization_id, review_id, content_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now())`,
    [randomUUID(), over.organizationId ?? scope.organizationId, reviewId, over.hash ?? HASH],
  );

describe("review_versions : contraintes et immuabilité", () => {
  it("une ligne par review (23505), hachage bien formé (23514), clé composite (23503)", async () => {
    const scope = await reviewScope(db, "rv-a");
    const other = await reviewScope(db, "rv-a2");
    const review = await insertReview(db, scope);
    await version(scope, review);
    expect(await sqlState(() => version(scope, review))).toBe(UNIQUE);
    const second = await insertReview(db, scope, { targetRef: "F-002" });
    expect(await sqlState(() => version(scope, second, { hash: "nope" }))).toBe(CHECK);
    expect(
      await sqlState(() => version(scope, second, { organizationId: other.organizationId })),
    ).toBe(FOREIGN_KEY);
  });

  it("append-only : UPDATE et DELETE directs refusés, comme le journal des reviews", async () => {
    const scope = await reviewScope(db, "rv-b");
    const review = await insertReview(db, scope);
    await version(scope, review);
    expect(
      await sqlState(() =>
        db.query("UPDATE review_versions SET content_hash = $1 WHERE review_id = $2", [
          "b".repeat(64),
          review,
        ]),
      ),
    ).toBe(RESTRICT);
    expect(
      await sqlState(() => db.query("DELETE FROM review_versions WHERE review_id = $1", [review])),
    ).toBe(RESTRICT);
    expect(await sqlState(() => db.query("TRUNCATE review_versions"))).toBe(RESTRICT);
    expect(
      await sqlState(() => db.query("UPDATE reviews SET comment = 'x' WHERE id = $1", [review])),
    ).toBe(RESTRICT);
  });

  it("accepte les quatre nouvelles cibles de review ; la suppression du projet emporte reviews et versions", async () => {
    const scope = await reviewScope(db, "rv-c");
    for (const [targetKind, targetRef] of [
      ["flow", "P-001"],
      ["rules", "rules"],
      ["roles", "roles"],
      ["deliverable", "functional"],
    ] as const) {
      const id = await insertReview(db, scope, { targetKind, targetRef });
      await version(scope, id);
    }
    await db.query("DELETE FROM projects WHERE id = $1", [scope.projectId]);
    const [row] = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM review_versions WHERE organization_id = $1",
      [scope.organizationId],
    );
    expect(row?.n).toBe("0");
  });
});
