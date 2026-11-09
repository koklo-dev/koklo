import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { insertScope, sqlState } from "./support/ticket-fixtures.ts";

/** TK-91 (lot A) : bornes et unicités de `idea_versions` et `idea_synthesis`, prouvées par SQL direct. */
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

type Scope = Awaited<ReturnType<typeof insertScope>>;

interface VersionOver {
  number?: number;
  tag?: string;
  batchId?: string | null;
  versions?: string;
  projectId?: string;
}

const version = (scope: Scope, over: VersionOver = {}) => {
  const number = over.number ?? 1;
  return db.query(
    `INSERT INTO idea_versions (id, organization_id, project_id, number, tag, batch_id, pages_versions, frozen_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now(), now())`,
    [
      randomUUID(),
      scope.organizationId,
      over.projectId ?? scope.projectId,
      number,
      over.tag ?? `idea-v${number}`,
      over.batchId === undefined ? null : over.batchId,
      over.versions ?? '{"vision":2}',
    ],
  );
};

const synthesis = (scope: Scope, over: { content?: string; source?: string | null } = {}) =>
  db.query(
    `INSERT INTO idea_synthesis (id, organization_id, project_id, content_md, source, generated_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, now(), now())`,
    [
      randomUUID(),
      scope.organizationId,
      scope.projectId,
      over.content ?? "Synthèse",
      over.source === undefined ? null : over.source,
    ],
  );

describe("idea_versions : CHECK, unicité et clés", () => {
  it.each([
    ["numéro 1", { number: 1 }],
    ["numéro 9999", { number: 9999 }],
  ])("accepte %s", async (_label, over) => {
    const scope = await insertScope(db, "ver-ok");
    expect(await sqlState(() => version(scope, over))).toBeUndefined();
  });

  it.each([
    ["numéro 0", { number: 0, tag: "idea-v0" }],
    ["numéro 10000", { number: 10_000, tag: "idea-v10000" }],
    ["étiquette incohérente avec le numéro", { number: 2, tag: "idea-v3" }],
    ["étiquette libre", { number: 1, tag: "v1; rm -rf" }],
    ["empreinte de pages qui n'est pas un objet", { versions: "[1,2]" }],
  ])("refuse %s (CHECK)", async (_label, over) => {
    const scope = await insertScope(db, "ver-ko");
    expect(await sqlState(() => version(scope, over))).toBe(CHECK);
  });

  it("refuse un second numéro identique pour le projet, accepte le même ailleurs", async () => {
    const scope = await insertScope(db, "ver-uniq");
    await version(scope, { number: 1 });
    expect(await sqlState(() => version(scope, { number: 1 }))).toBe(UNIQUE);
    const other = await insertScope(db, "ver-uniq-2");
    expect(await sqlState(() => version(other, { number: 1 }))).toBeUndefined();
  });

  it("refuse un second lot identique pour le projet", async () => {
    const scope = await insertScope(db, "ver-batch");
    const batchId = randomUUID();
    await version(scope, { number: 1, batchId });
    expect(await sqlState(() => version(scope, { number: 2, batchId }))).toBe(UNIQUE);
  });

  it("refuse un projet inconnu (clé étrangère)", async () => {
    const scope = await insertScope(db, "ver-fk");
    expect(await sqlState(() => version(scope, { projectId: randomUUID() }))).toBe(FOREIGN_KEY);
  });
});

describe("idea_synthesis : CHECK, unicité et clés", () => {
  it("accepte un aperçu (source vide) et une version publiée", async () => {
    const scope = await insertScope(db, "syn-ok");
    expect(await sqlState(() => synthesis(scope, { source: null }))).toBeUndefined();
    const other = await insertScope(db, "syn-ok-2");
    expect(await sqlState(() => synthesis(other, { source: "idea-v12" }))).toBeUndefined();
  });

  it.each([
    ["contenu vide", { content: "" }],
    ["contenu de 50 001 caractères", { content: "a".repeat(50_001) }],
    ["source libre", { source: "brouillon" }],
    ["source avec zéro initial", { source: "idea-v01" }],
    ["source de cinq chiffres", { source: "idea-v10000" }],
  ])("refuse %s (CHECK)", async (_label, over) => {
    const scope = await insertScope(db, "syn-ko");
    expect(await sqlState(() => synthesis(scope, over))).toBe(CHECK);
  });

  it("refuse une seconde Synthèse pour le projet", async () => {
    const scope = await insertScope(db, "syn-uniq");
    await synthesis(scope);
    expect(await sqlState(() => synthesis(scope))).toBe(UNIQUE);
  });

  it("refuse un projet inconnu (clé étrangère)", async () => {
    const scope = await insertScope(db, "syn-fk");
    expect(await sqlState(() => synthesis({ ...scope, projectId: randomUUID() }))).toBe(
      FOREIGN_KEY,
    );
  });
});
