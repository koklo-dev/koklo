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
import { apiFor, createWorld, seedSprint, seedTicket, ticketRow } from "./helpers/tickets.ts";

/** TK-34 : ordre d'écriture, cycles, conflits (jamais de 500) sur base réelle. */
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

const edgeRows = (organizationId: string) =>
  database.query<{ from_key: string; to_key: string; type: string }>(
    `SELECT a.key AS from_key, b.key AS to_key, d.type
       FROM ticket_dependencies d JOIN tickets a ON a.id = d.ticket_id JOIN tickets b ON b.id = d.depends_on_id
      WHERE d.organization_id = $1 ORDER BY a.key, b.key`,
    [organizationId],
  );

describe("ordre : tous les tickets d'abord, puis les dépendances", () => {
  it("une dépendance vers un ticket d'un fichier plus tardif est créée", async () => {
    const world = await createWorld(database);
    const sources = [
      {
        fileName: sprintFile(50),
        text: sprintMarkdown(50, [
          ticketBlock({ key: "TK-501", title: "Premier", dependsOn: "TK-502" }),
        ]),
      },
      {
        fileName: sprintFile(51),
        text: sprintMarkdown(51, [ticketBlock({ key: "TK-502", title: "Second" })]),
      },
    ];
    const report = await importerOf(app).run(scopeOf(world), sources, IMPORT_OPTIONS);
    expect(report.ok).toBe(true);
    expect(await edgeRows(world.organizationId)).toEqual([
      { from_key: "TK-501", to_key: "TK-502", type: "blocks" },
    ]);
  });

  it("la fixture donne l'arête en avant TK-14 -> TK-84", async () => {
    const world = await createWorld(database);
    await importerOf(app).run(scopeOf(world), fixtureSources(), IMPORT_OPTIONS);
    expect(await edgeRows(world.organizationId)).toContainEqual({
      from_key: "TK-14",
      to_key: "TK-84",
      type: "blocks",
    });
  });
});

describe("ordre : tous les tickets d'abord, puis les dépendances (suite 2)", () => {
  it("un cycle est détecté : l'arête fautive est rejetée, les tickets et l'autre arête restent", async () => {
    const world = await createWorld(database);
    const text = sprintMarkdown(52, [
      ticketBlock({ key: "TK-511", title: "A", dependsOn: "TK-512" }),
      ticketBlock({ key: "TK-512", title: "B", dependsOn: "TK-511" }),
      ticketBlock({ key: "TK-513", title: "C", dependsOn: "TK-511" }),
    ]);
    const report = await importerOf(app).run(
      scopeOf(world),
      [{ fileName: sprintFile(52), text }],
      IMPORT_OPTIONS,
    );
    expect(report.ok).toBe(false);
    expect(report.tickets.created).toBe(3);
    expect(report.dependencies).toMatchObject({ created: 2, rejected: 1 });
    expect(report.totalsByCode["dependency-cycle"]).toBe(1);
    expect(await edgeRows(world.organizationId)).toHaveLength(2);
  });

  it("une dépendance vers une clé inconnue est rapportée, pas ignorée", async () => {
    const world = await createWorld(database);
    const text = sprintMarkdown(53, [
      ticketBlock({ key: "TK-521", title: "A", dependsOn: "TK-999" }),
    ]);
    const report = await importerOf(app).run(
      scopeOf(world),
      [{ fileName: sprintFile(53), text }],
      IMPORT_OPTIONS,
    );
    expect(report.ok).toBe(false);
    expect(report.tickets.created).toBe(1);
    expect(report.dependencies.rejected).toBe(1);
    expect(report.lines.find((l) => l.code === "dependency-target-missing")).toMatchObject({
      key: "TK-521",
    });
  });
});

describe("ordre : tous les tickets d'abord, puis les dépendances (suite 3)", () => {
  it("une dépendance vers un ticket déjà en base (autre import) est acceptée", async () => {
    const world = await createWorld(database);
    const scope = scopeOf(world);
    await importerOf(app).run(
      scope,
      [
        {
          fileName: sprintFile(54),
          text: sprintMarkdown(54, [ticketBlock({ key: "TK-531", title: "Base" })]),
        },
      ],
      IMPORT_OPTIONS,
    );
    const text = sprintMarkdown(55, [
      ticketBlock({ key: "TK-532", title: "Suite", dependsOn: "TK-531" }),
    ]);
    const report = await importerOf(app).run(
      scope,
      [{ fileName: sprintFile(55), text }],
      IMPORT_OPTIONS,
    );
    expect(report.ok).toBe(true);
    expect(report.dependencies.created).toBe(1);
  });
});

describe("conflits rapportés, jamais de 500", () => {
  it("clé déjà en base avec un autre titre (projet de démo) : conflit, rien de modifié, import continué", async () => {
    const world = await createWorld(database);
    await seedSprint(app, world.actors.owner);
    await seedTicket(app, world.actors.owner, { title: "Sans rapport" });
    const before = await tableCounts(database, world.organizationId);

    const report = await importerOf(app).run(scopeOf(world), fixtureSources(), IMPORT_OPTIONS);

    expect(report.ok).toBe(false);
    expect(report.sprints).toMatchObject({ created: 16, conflicts: 1 });
    expect(report.tickets.conflicts).toBeGreaterThanOrEqual(1);
    expect(report.totalsByCode["title-conflict"]).toBeGreaterThanOrEqual(1);
    expect(report.totalsByCode["sprint-conflict"]).toBe(1);
    expect((await ticketRow(database, world.organizationId, "TK-1"))?.title).toBe("Sans rapport");
    // Les sprints sans conflit sont importés normalement.
    expect((await ticketRow(database, world.organizationId, "TK-12"))?.title).toBe(
      "apps/worker : démarrage pg-boss et job noop",
    );
    expect((await tableCounts(database, world.organizationId)).tickets).toBeGreaterThan(
      before.tickets,
    );
  });

  it("clé occupée par un ticket supprimé : conflit, jamais ressuscité", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.owner, { title: "À supprimer" });
    expect((await apiFor(app, world.actors.owner).deleteTicket(ticket.key)).status).toBe(200);

    const report = await importerOf(app).run(scopeOf(world), fixtureSources(), IMPORT_OPTIONS);

    expect(report.ok).toBe(false);
    expect(report.totalsByCode["deleted-ticket-conflict"]).toBe(1);
    expect(report.tickets.conflicts).toBe(1);
    const row = await ticketRow(database, world.organizationId, "TK-1");
    expect(row?.title).toBe("À supprimer");
    expect(row?.deleted_at).not.toBeNull();
  });
});
