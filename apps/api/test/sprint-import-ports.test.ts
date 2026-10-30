import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SPRINT_REPOSITORY, type SprintRepository } from "../src/sprint/sprint.repository.ts";
import { TICKET_REPOSITORY, type TicketRepository } from "../src/ticket/ticket.repository.ts";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { scopeOf } from "./helpers/sprint-import.ts";
import { createWorld } from "./helpers/tickets.ts";

/** TK-34 : les ports TicketStore et SprintStore s'étendent, sans SQL brut ni contournement des règles. */
let database: TestDatabase;
let app: INestApplication;
let tickets: TicketRepository;
let sprints: SprintRepository;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  tickets = app.get<TicketRepository>(TICKET_REPOSITORY);
  sprints = app.get<SprintRepository>(SPRINT_REPOSITORY);
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const imported = (key: string, over: Record<string, unknown> = {}) => ({
  key,
  title: "Importé",
  description: "À faire",
  type: "task" as const,
  priority: "medium" as const,
  pkg: "api" as const,
  sensitivity: "safe" as const,
  estimateHours: null,
  assignee: null,
  labels: [],
  linkedFeatures: [],
  status: "done" as const,
  sprintId: null,
  criteria: [
    { statement: "Prouvé", specRef: null, proven: true },
    { statement: "À prouver", specRef: null, proven: false },
  ],
  ...over,
});

describe("TicketStore", () => {
  it("insertImported conserve la clé fournie, crée en done et enregistre l'état des critères", async () => {
    const world = await createWorld(database);
    const record = await tickets.run(scopeOf(world), (store) =>
      store.insertImported(imported("TK-500")),
    );
    expect(record).toMatchObject({ key: "TK-500", status: "done" });
    const rows = await database.query<{ statement: string; proof_status: string }>(
      `SELECT c.statement, c.proof_status FROM acceptance_criteria c JOIN tickets t ON t.id = c.ticket_id
        WHERE t.organization_id = $1 AND t.key = 'TK-500' ORDER BY c.position`,
      [world.organizationId],
    );
    expect(rows.map((r) => r.proof_status)).toEqual(["proven", "pending"]);
  });

  it("raiseCounter relève sans jamais faire reculer le compteur", async () => {
    const world = await createWorld(database);
    const next = () => tickets.run(scopeOf(world), (store) => store.nextNumber());
    await tickets.run(scopeOf(world), (store) => store.raiseCounter(500));
    expect(await next()).toBe(501);
    await tickets.run(scopeOf(world), (store) => store.raiseCounter(10));
    expect(await next()).toBe(502);
  });

  it("findIncludingDeleted voit aussi les tickets supprimés, que find ne voit pas", async () => {
    const world = await createWorld(database);
    const scope = scopeOf(world);
    const record = await tickets.run(scope, (store) => store.insertImported(imported("TK-600")));
    expect(await tickets.run(scope, (store) => store.findIncludingDeleted("TK-600"))).toEqual({
      id: record.id,
      key: "TK-600",
      title: "Importé",
      deleted: false,
    });
    await tickets.run(scope, (store) => store.softDelete(record.id));
    expect(await tickets.run(scope, (store) => store.find("TK-600"))).toBeNull();
    expect(await tickets.run(scope, (store) => store.findIncludingDeleted("TK-600"))).toMatchObject(
      {
        key: "TK-600",
        deleted: true,
      },
    );
    expect(await tickets.run(scope, (store) => store.findIncludingDeleted("TK-601"))).toBeNull();
  });
});

describe("SprintStore", () => {
  it("raiseCounter relève sans jamais faire reculer le compteur de sprints", async () => {
    const world = await createWorld(database);
    const next = () => sprints.run(scopeOf(world), (store) => store.nextNumber());
    await sprints.run(scopeOf(world), (store) => store.raiseCounter(17));
    expect(await next()).toBe(18);
    await sprints.run(scopeOf(world), (store) => store.raiseCounter(3));
    expect(await next()).toBe(19);
  });

  it("insert accepte un numéro fourni et le passage direct à closed", async () => {
    const world = await createWorld(database);
    const scope = scopeOf(world);
    const sprint = await sprints.run(scope, (store) =>
      store.insert({
        number: 12,
        goal: "Objectif",
        startsOn: "2026-11-02",
        endsOn: "2026-11-13",
        definitionOfDone: "",
      }),
    );
    expect(sprint.key).toBe("SP-12");
    const closed = await sprints.run(scope, (store) =>
      store.update(sprint.id, { status: "closed" }),
    );
    expect(closed.status).toBe("closed");
  });
});
