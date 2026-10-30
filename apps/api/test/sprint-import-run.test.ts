import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseSprintFile } from "../src/sprint-import/parse-sprint-file.ts";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { count } from "./helpers/organizations.ts";
import {
  fixtureSources,
  IMPORT_OPTIONS,
  importerOf,
  scopeOf,
  tableCounts,
} from "./helpers/sprint-import.ts";
import { apiFor, auditRows, createWorld } from "./helpers/tickets.ts";

/** TK-34 : import de la fixture réelle (86 tickets, 17 sprints) dans un projet vide, base réelle. */
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

const parsedFixture = fixtureSources().map((s) => parseSprintFile(s.fileName, s.text));
const EDGES = parsedFixture.flatMap((s) => s.tickets).reduce((n, t) => n + t.dependsOn.length, 0);

async function importedWorld() {
  const world = await createWorld(database);
  const report = await importerOf(app).run(scopeOf(world), fixtureSources(), IMPORT_OPTIONS);
  return { world, report };
}

describe("import de la fixture réelle", () => {
  it("crée 17 sprints, 86 tickets et toutes les arêtes, rapport sans erreur ni ligne inconnue", async () => {
    const { world, report } = await importedWorld();
    expect(report).toMatchObject({
      dryRun: false,
      ok: true,
      files: 17,
      sprints: { created: 17, matched: 0, conflicts: 0 },
      tickets: { created: 86, matched: 0, conflicts: 0, rejected: 0 },
      dependencies: { created: EDGES, present: 0, rejected: 0 },
    });
    expect(report.lines.filter((l) => l.severity === "error")).toEqual([]);
    expect(report.totalsByCode["unknown-line"]).toBeUndefined();
    expect(report.totalsByCode["missing-package"]).toBe(3);
    const counts = await tableCounts(database, world.organizationId);
    expect(counts).toMatchObject({ tickets: 86, sprints: 17, dependencies: EDGES });
    expect(counts.criteria).toBeGreaterThan(86);
  });

  it("conserve clé, titre, paquet, sensibilité, état, sprint et critères de chaque ticket", async () => {
    const { world } = await importedWorld();
    const api = apiFor(app, world.actors.owner);
    const worker = (await api.getTicket("TK-12")).body;
    expect(worker).toMatchObject({
      key: "TK-12",
      title: "apps/worker : démarrage pg-boss et job noop",
      pkg: "worker",
      sensitivity: "safe",
      status: "done",
      sprint: "SP-3",
      type: "task",
      priority: "medium",
      labels: [],
    });
    expect(worker.criteria).toHaveLength(1);
    expect((await api.getTicket("TK-85")).body).toMatchObject({ status: "todo", pkg: "web" });
    expect((await api.getTicket("TK-4")).body.status).toBe("done");
    expect((await api.getTicket("TK-10")).body.pkg).toBe("api");
    const forward = (await api.getTicket("TK-14")).body;
    expect(forward.dependencies).toContainEqual({
      ticket: "TK-14",
      dependsOn: "TK-84",
      type: "blocks",
    });
    const rows = await database.query<{ proof_status: string }>(
      `SELECT c.proof_status FROM acceptance_criteria c JOIN tickets t ON t.id = c.ticket_id
        WHERE t.organization_id = $1 AND t.key = 'TK-12'`,
      [world.organizationId],
    );
    expect(rows.map((r) => r.proof_status)).toEqual(["proven"]);
  });
});

describe("import de la fixture réelle (suite 2)", () => {
  it("12 sensitive, 74 safe, aucun ticket sans sprint", async () => {
    const { world } = await importedWorld();
    const where = "organization_id = $1 AND sensitivity = $2";
    expect(await count(database, "tickets", where, [world.organizationId, "sensitive"])).toBe(12);
    expect(await count(database, "tickets", where, [world.organizationId, "safe"])).toBe(74);
    expect(
      await count(database, "tickets", "organization_id = $1 AND sprint_id IS NULL", [
        world.organizationId,
      ]),
    ).toBe(0);
  });

  it("sprint soldé closed, sinon planned ; aucun sprint activé ; sprint-017 vide importé", async () => {
    const { world } = await importedWorld();
    const rows = await database.query<{ key: string; status: string; goal: string }>(
      "SELECT key, status, goal FROM sprints WHERE organization_id = $1 ORDER BY number",
      [world.organizationId],
    );
    const closed = new Set(["SP-1", "SP-2", "SP-4", "SP-5", "SP-6"]);
    for (const row of rows) {
      expect(row.status, row.key).toBe(closed.has(row.key) ? "closed" : "planned");
    }
    expect(rows).toHaveLength(17);
    expect(rows.some((r) => r.status === "active")).toBe(false);
    expect(rows[16]?.goal).toContain("trois tickets R6");
    const withTickets = await database.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tickets t JOIN sprints s ON s.id = t.sprint_id
        WHERE t.organization_id = $1 AND s.status = 'closed'`,
      [world.organizationId],
    );
    expect(withTickets[0]?.n).toBeGreaterThan(0);
  });
});

describe("import de la fixture réelle (suite 3)", () => {
  it("les sprints sans date reçoivent --starts-on / --ends-on de l'import", async () => {
    const { world } = await importedWorld();
    const rows = await database.query<{ starts_on: string; ends_on: string }>(
      "SELECT starts_on::text, ends_on::text FROM sprints WHERE organization_id = $1",
      [world.organizationId],
    );
    expect(new Set(rows.map((r) => `${r.starts_on}/${r.ends_on}`))).toEqual(
      new Set(["2026-11-02/2026-11-13"]),
    );
  });

  it("relève les compteurs : le prochain ticket est TK-87, le prochain sprint SP-18", async () => {
    const { world } = await importedWorld();
    const api = apiFor(app, world.actors.owner);
    expect((await api.createTicket({ status: "todo" })).body.key).toBe("TK-87");
    expect((await api.createSprint()).body.key).toBe("SP-18");
  });

  it("une ligne d'audit par écriture : sprint.import, ticket.import, dependency.import", async () => {
    const { world } = await importedWorld();
    const rows = await auditRows(database, world.organizationId);
    const tally = (action: string) => rows.filter((r) => r.action === action).length;
    expect(tally("sprint.import")).toBe(17);
    expect(tally("ticket.import")).toBe(86);
    expect(tally("dependency.import")).toBe(EDGES);
    expect(rows).toHaveLength(17 + 86 + EDGES);
    expect(rows.every((r) => r.actor_kind === "human")).toBe(true);
    expect(new Set(rows.map((r) => r.actor_id))).toEqual(new Set([world.actors.owner.userId]));
  });

  it("isolation : l'import d'une organisation n'écrit ni ne lit rien d'une autre", async () => {
    const one = await createWorld(database);
    const two = await createWorld(database);
    await importerOf(app).run(scopeOf(one), fixtureSources(), IMPORT_OPTIONS);
    expect(await tableCounts(database, two.organizationId)).toEqual({
      tickets: 0,
      sprints: 0,
      dependencies: 0,
      criteria: 0,
      audit: 0,
    });
    const report = await importerOf(app).run(scopeOf(two), fixtureSources(), IMPORT_OPTIONS);
    expect(report.tickets).toMatchObject({ created: 86, matched: 0 });
    expect((await tableCounts(database, one.organizationId)).tickets).toBe(86);
    // Projet de B réclamé sous l'organisation de A : refusé, rien n'est écrit.
    const crossed = { ...scopeOf(one), projectId: two.projectId };
    await expect(
      importerOf(app).run(crossed, fixtureSources(), IMPORT_OPTIONS),
    ).rejects.toBeTruthy();
    expect((await tableCounts(database, two.organizationId)).tickets).toBe(86);
  });
});

describe("--dry-run", () => {
  it("produit le même rapport que l'import réel sans rien écrire", async () => {
    const dryWorld = await createWorld(database);
    const realWorld = await createWorld(database);
    const dry = await importerOf(app).run(scopeOf(dryWorld), fixtureSources(), {
      ...IMPORT_OPTIONS,
      dryRun: true,
    });
    const real = await importerOf(app).run(scopeOf(realWorld), fixtureSources(), IMPORT_OPTIONS);
    expect(dry.dryRun).toBe(true);
    expect({ ...dry, dryRun: false }).toEqual(real);
    expect(await tableCounts(database, dryWorld.organizationId)).toEqual({
      tickets: 0,
      sprints: 0,
      dependencies: 0,
      criteria: 0,
      audit: 0,
    });
    // Aucun compteur relevé non plus : le premier ticket reçoit TK-1.
    const first = await apiFor(app, dryWorld.actors.owner).createTicket({ status: "todo" });
    expect(first.body.key).toBe("TK-1");
  });
});
