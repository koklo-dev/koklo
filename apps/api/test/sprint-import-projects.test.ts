import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { count } from "./helpers/organizations.ts";
import { fixtureSources, IMPORT_OPTIONS, importerOf, scopeOf } from "./helpers/sprint-import.ts";
import { apiFor, createWorld, insertProject } from "./helpers/tickets.ts";

/**
 * TK-96 (C8) : l'import du vault rattache ses tickets au projet demandé (`--project`), jamais à un
 * « projet par défaut » : deux projets d'une même organisation restent étanches.
 */
let database: TestDatabase;
let app: INestApplication;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const inProject = (table: string, projectId: string) =>
  count(database, table, "project_id = $1", [projectId]);

describe("import du vault avec deux projets", () => {
  it("n'écrit que dans le projet désigné, même quand il n'est pas le plus ancien", async () => {
    const world = await createWorld(database);
    const younger = await insertProject(
      database,
      world.organizationId,
      "Récent",
      "2026-09-01T00:00:00.000Z",
    );
    const report = await importerOf(app).run(
      { ...scopeOf(world), projectId: younger },
      fixtureSources(),
      IMPORT_OPTIONS,
    );
    expect(report.tickets).toMatchObject({ created: 86, matched: 0 });
    expect(await inProject("tickets", younger)).toBe(86);
    expect(await inProject("sprints", younger)).toBe(17);
    expect(await inProject("tickets", world.projectId)).toBe(0);
    expect(await inProject("sprints", world.projectId)).toBe(0);
    const audit = await database.query<{ project_id: string | null }>(
      "SELECT DISTINCT project_id FROM audit_log WHERE organization_id = $1 AND action LIKE '%.import'",
      [world.organizationId],
    );
    expect(audit.map((r) => r.project_id)).toEqual([younger]);
    // Les compteurs de l'autre projet n'ont pas bougé : son premier ticket reçoit TK-1.
    const first = await apiFor(app, world.actors.owner, world.projectId).createTicket({
      status: "todo",
    });
    expect(first.body.key).toBe("TK-1");
  });

  it("importer dans les deux projets donne deux jeux indépendants (mêmes clés, aucun rapprochement)", async () => {
    const world = await createWorld(database);
    const other = await insertProject(
      database,
      world.organizationId,
      "Autre",
      "2026-09-01T00:00:00.000Z",
    );
    const one = await importerOf(app).run(scopeOf(world), fixtureSources(), IMPORT_OPTIONS);
    const two = await importerOf(app).run(
      { ...scopeOf(world), projectId: other },
      fixtureSources(),
      IMPORT_OPTIONS,
    );
    expect(one.tickets).toMatchObject({ created: 86, matched: 0 });
    expect(two.tickets).toMatchObject({ created: 86, matched: 0 });
    expect(await inProject("tickets", world.projectId)).toBe(86);
    expect(await inProject("tickets", other)).toBe(86);
    const rerun = await importerOf(app).run(scopeOf(world), fixtureSources(), IMPORT_OPTIONS);
    expect(rerun.tickets).toMatchObject({ created: 0, matched: 86 });
    expect(await inProject("tickets", other)).toBe(86);
  });
});
