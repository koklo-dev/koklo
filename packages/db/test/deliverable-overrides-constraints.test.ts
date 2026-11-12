import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { notificationScope } from "./support/notifications-fixtures.ts";
import { secondProject } from "./support/project-client-fixtures.ts";
import { sqlState } from "./support/ticket-fixtures.ts";

/** TK-100 (lot A) : unicité, CHECK, clé composite et cascade de `deliverable_overrides`. */
const CHECK = "23514";
const UNIQUE = "23505";
const FOREIGN_KEY = "23503";

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
}, 180_000);
afterAll(async () => {
  await db?.dispose();
}, 60_000);

interface Scope {
  organizationId: string;
  projectId: string;
  userId: string;
}

const force = (
  scope: Scope,
  deliverable = "data",
  over: { projectId?: string; organizationId?: string } = {},
) =>
  db.query(
    `INSERT INTO deliverable_overrides (id, organization_id, project_id, deliverable, forced_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      randomUUID(),
      over.organizationId ?? scope.organizationId,
      over.projectId ?? scope.projectId,
      deliverable,
      scope.userId,
    ],
  );

describe("deliverable_overrides : contraintes", () => {
  it("accepte chacun des sept livrables, horodate le forçage par défaut", async () => {
    const scope = await notificationScope(db, "ov-a");
    for (const key of [
      "functional",
      "data",
      "architecture",
      "technical",
      "security",
      "design",
      "quality",
    ]) {
      expect(await sqlState(() => force(scope, key)), key).toBeUndefined();
    }
    const [row] = await db.query<{ forced_at: Date | null }>(
      "SELECT forced_at FROM deliverable_overrides WHERE project_id = $1 LIMIT 1",
      [scope.projectId],
    );
    expect(row?.forced_at).toBeInstanceOf(Date);
  });

  it("refuse une clé hors liste (23514), notamment les écrans", async () => {
    const scope = await notificationScope(db, "ov-b");
    for (const key of ["screens", "Functional", ""]) {
      expect(await sqlState(() => force(scope, key)), key).toBe(CHECK);
    }
  });

  it("refuse un second forçage du même livrable et du même projet (23505), accepte un autre projet", async () => {
    const scope = await notificationScope(db, "ov-c");
    await force(scope, "data");
    expect(await sqlState(() => force(scope, "data"))).toBe(UNIQUE);
    const other = await secondProject(db, scope, "ov-c2");
    expect(await sqlState(() => force(scope, "data", { projectId: other }))).toBeUndefined();
  });

  it("clé étrangère composite : un projet d'une autre organisation est refusé (23503)", async () => {
    const scope = await notificationScope(db, "ov-d");
    const foreign = await notificationScope(db, "ov-d2");
    expect(await sqlState(() => force(scope, "data", { projectId: foreign.projectId }))).toBe(
      FOREIGN_KEY,
    );
  });

  it("la suppression du projet supprime ses forçages (cascade)", async () => {
    const scope = await notificationScope(db, "ov-e");
    await force(scope, "design");
    await db.query("DELETE FROM projects WHERE id = $1", [scope.projectId]);
    const rows = await db.query("SELECT 1 FROM deliverable_overrides WHERE project_id = $1", [
      scope.projectId,
    ]);
    expect(rows).toHaveLength(0);
  });
});
