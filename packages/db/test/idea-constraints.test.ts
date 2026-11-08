import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { insertIdeaPage } from "./support/idea-fixtures.ts";
import { insertScope, sqlState } from "./support/ticket-fixtures.ts";

/** TK-89 (T6) : bornes des colonnes de `idea_pages`, prouvées par SQL direct. */
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

const fresh = async (label: string) => insertScope(db, label);

describe("idea_pages : CHECK", () => {
  it("accepte une page valide aux bornes", async () => {
    const scope = await fresh("ok");
    expect(
      await sqlState(() =>
        insertIdeaPage(db, scope, {
          title: "a".repeat(120),
          contentMd: "a".repeat(50_000),
          position: 0,
          version: 1,
        }),
      ),
    ).toBeUndefined();
  });

  it.each([
    ["contenu de 50 001 caractères", { contentMd: "a".repeat(50_001) }],
    ["position négative", { position: -1 }],
    ["version 0", { version: 0 }],
    ["titre vide", { title: "" }],
    ["titre de 121 caractères", { title: "a".repeat(121) }],
    ["slug avec majuscule", { slug: "Vision" }],
    ["slug de 41 caractères", { slug: "a".repeat(41) }],
    ["page requise en corbeille", { required: true, deletedAt: "2026-11-08T10:00:00Z" }],
  ])("refuse : %s", async (_label, over) => {
    const scope = await fresh("check");
    expect(await sqlState(() => insertIdeaPage(db, scope, over))).toBe(CHECK);
  });

  it("accepte une page non requise en corbeille", async () => {
    const scope = await fresh("trash");
    expect(
      await sqlState(() => insertIdeaPage(db, scope, { deletedAt: "2026-11-08T10:00:00Z" })),
    ).toBeUndefined();
  });
});

describe("idea_pages : unicité et clés étrangères", () => {
  it("le slug est unique par projet, corbeille comprise ; libre dans un autre projet", async () => {
    const scope = await fresh("slug");
    await insertIdeaPage(db, scope, { slug: "vision", deletedAt: "2026-11-08T10:00:00Z" });
    expect(await sqlState(() => insertIdeaPage(db, scope, { slug: "vision" }))).toBe(UNIQUE);
    const other = await fresh("slug-other");
    expect(await sqlState(() => insertIdeaPage(db, other, { slug: "vision" }))).toBeUndefined();
  });

  it("la clé étrangère composite refuse un projet d'une autre organisation", async () => {
    const scope = await fresh("fk-a");
    const other = await fresh("fk-b");
    const state = await sqlState(() =>
      insertIdeaPage(db, { organizationId: other.organizationId, projectId: scope.projectId }),
    );
    expect(state).toBe(FOREIGN_KEY);
  });

  it("supprimer le projet supprime ses pages", async () => {
    const scope = await fresh("cascade");
    await insertIdeaPage(db, scope);
    await db.query("DELETE FROM projects WHERE id = $1", [scope.projectId]);
    const rows = await db.query("SELECT 1 FROM idea_pages WHERE project_id = $1", [
      scope.projectId,
    ]);
    expect(rows).toHaveLength(0);
  });

  it("publication : empreinte hexadécimale et instantané objet exigés", async () => {
    const scope = await fresh("pub");
    const insert = (sha: string, versions: string) =>
      db.query(
        `INSERT INTO idea_publications (id, organization_id, project_id, commit_sha, published_at, pages_versions, updated_at)
         VALUES ($1, $2, $3, $4, now(), $5::jsonb, now())`,
        [randomUUID(), scope.organizationId, scope.projectId, sha, versions],
      );
    expect(await sqlState(() => insert("a".repeat(40), "{}"))).toBeUndefined();
    expect(await sqlState(() => insert("xyz", "{}"))).toBe(CHECK);
    expect(await sqlState(() => insert("b".repeat(40), "[]"))).toBe(CHECK);
  });
});
