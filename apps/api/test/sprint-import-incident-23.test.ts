import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import {
  fixtureSources,
  IMPORT_OPTIONS,
  importerOf,
  scopeOf,
  sprintFile,
  sprintMarkdown,
  tableCounts,
  ticketBlock,
} from "./helpers/sprint-import.ts";
import { apiFor, createWorld, ticketRow } from "./helpers/tickets.ts";

/**
 * Incident 23 (annexe C) : 46 tickets de rétro en doublon (titre non échappé). L'appariement se
 * fait par clé `TK-n`, jamais par titre ; un second import ne crée ni ne modifie rien.
 */
let database: TestDatabase;
let app: INestApplication;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const TRAPS = [
  "Titre `avec` backticks / barre : deux-points <id> $1 % (x) [y] **gras** .* \\d '' \"",
  "'; DROP TABLE tickets; --",
  "Titre identique",
  "Titre identique",
];

const trapSources = (titles = TRAPS) => [
  {
    fileName: sprintFile(60),
    text: sprintMarkdown(
      60,
      titles.map((title, i) => ticketBlock({ key: `TK-${700 + i}`, title })),
    ),
  },
];

describe("incident-23-second-import-creates-no-duplicate", () => {
  it("incident-23-second-import-creates-no-duplicate : deux imports de la fixture, aucun doublon", async () => {
    const world = await createWorld(database);
    const scope = scopeOf(world);
    const first = await importerOf(app).run(scope, fixtureSources(), IMPORT_OPTIONS);
    const before = await tableCounts(database, world.organizationId);
    const second = await importerOf(app).run(scope, fixtureSources(), IMPORT_OPTIONS);

    expect(first.tickets.created).toBe(86);
    expect(second.ok).toBe(true);
    expect(second.tickets).toMatchObject({ created: 0, matched: 86, conflicts: 0, rejected: 0 });
    expect(second.sprints).toMatchObject({ created: 0, matched: 17, conflicts: 0 });
    expect(second.dependencies.created).toBe(0);
    expect(second.dependencies.present).toBe(first.dependencies.created);
    expect(await tableCounts(database, world.organizationId)).toEqual(before);
  });

  it("incident-23-second-import-creates-no-duplicate : titres piégeux conservés à l'identique, appariés par clé", async () => {
    const world = await createWorld(database);
    const scope = scopeOf(world);
    const first = await importerOf(app).run(scope, trapSources(), IMPORT_OPTIONS);
    expect(first.tickets).toMatchObject({ created: 4, rejected: 0 });
    const api = apiFor(app, world.actors.owner);
    for (const [i, title] of TRAPS.entries()) {
      expect((await api.getTicket(`TK-${700 + i}`)).body.title).toBe(title);
    }
    const before = await tableCounts(database, world.organizationId);

    const second = await importerOf(app).run(scope, trapSources(), IMPORT_OPTIONS);
    expect(second.tickets).toMatchObject({ created: 0, matched: 4, conflicts: 0 });
    expect(await tableCounts(database, world.organizationId)).toEqual(before);
  });
});

describe("incident-23-second-import-creates-no-duplicate (suite 2)", () => {
  it("incident-23-second-import-creates-no-duplicate : deux clés au même titre restent deux tickets (jamais d'appariement par titre)", async () => {
    const world = await createWorld(database);
    await importerOf(app).run(scopeOf(world), trapSources(), IMPORT_OPTIONS);
    const same = await database.query<{ key: string }>(
      "SELECT key FROM tickets WHERE organization_id = $1 AND title = 'Titre identique' ORDER BY key",
      [world.organizationId],
    );
    expect(same.map((r) => r.key)).toEqual(["TK-702", "TK-703"]);
  });

  it("incident-23-second-import-creates-no-duplicate : même clé avec un autre titre = conflit rapporté, ni doublon ni mise à jour", async () => {
    const world = await createWorld(database);
    const scope = scopeOf(world);
    await importerOf(app).run(scope, trapSources(), IMPORT_OPTIONS);
    const before = await tableCounts(database, world.organizationId);

    const changed = [...TRAPS];
    changed[0] = "Titre modifié";
    const report = await importerOf(app).run(scope, trapSources(changed), IMPORT_OPTIONS);

    expect(report.ok).toBe(false);
    expect(report.tickets).toMatchObject({ created: 0, matched: 3, conflicts: 1 });
    expect(report.lines.filter((l) => l.code === "title-conflict").map((l) => l.key)).toEqual([
      "TK-700",
    ]);
    expect(await tableCounts(database, world.organizationId)).toEqual(before);
    expect((await ticketRow(database, world.organizationId, "TK-700"))?.title).toBe(TRAPS[0]);
  });
});
