import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { count } from "./helpers/organizations.ts";
import {
  apiFor,
  createWorld,
  insertProject,
  seedSprint,
  seedTicket,
  ticketRow,
} from "./helpers/tickets.ts";

/**
 * TK-30 : isolation entre organisations et entre projets (NOT_FOUND, jamais FORBIDDEN), et défense
 * en profondeur sur les lignes enfants (pas de FK composite, TK-28).
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

describe("entre organisations", () => {
  it("les mêmes clés coexistent et aucune ressource ne fuit d'une organisation à l'autre", async () => {
    const one = await createWorld(database);
    const two = await createWorld(database);
    const a = apiFor(app, one.actors.dev, one.projectId);
    const b = apiFor(app, two.actors.dev, two.projectId);
    await seedSprint(app, one.actors.dev, one.projectId);
    await seedTicket(app, one.actors.dev, one.projectId, {
      title: "Secret de A",
      sprintId: "SP-1",
    });
    await seedTicket(app, two.actors.dev, two.projectId, { title: "Ticket de B" });

    expect((await a.getTicket("TK-1")).body.title).toBe("Secret de A");
    expect((await b.getTicket("TK-1")).body.title).toBe("Ticket de B");
    expect((await b.listTickets()).body.items).toHaveLength(1);

    // B n'a pas de sprint : SP-1 est introuvable pour lui, et B ne peut pas le toucher.
    for (const result of [
      await b.getSprint("SP-1"),
      await b.updateSprint("SP-1", { goal: "pirate" }),
      await b.activateSprint("SP-1"),
      await b.closeSprint("SP-1"),
    ]) {
      expect(result.status).toBe(404);
      expect(result.body.code).toBe("NOT_FOUND");
    }
    const attach = await b.createTicket({ sprintId: "SP-1" });
    expect(attach.status).toBe(422);
    expect(attach.body.data.field).toBe("sprintId");
    expect((await a.getSprint("SP-1")).body).toMatchObject({
      status: "planned",
      goal: "Un objectif",
    });
  });
});

describe("entre organisations (suite 2)", () => {
  it("un utilisateur d'une autre organisation ne peut ni modifier, ni supprimer, ni lier un ticket", async () => {
    const one = await createWorld(database);
    const two = await createWorld(database);
    await seedTicket(app, one.actors.dev, one.projectId, { title: "Intact" });
    await seedTicket(app, one.actors.dev, one.projectId);
    // B possède aussi un TK-1 et un TK-2 : ses écritures ne touchent que les siens.
    await seedTicket(app, two.actors.dev, two.projectId, { title: "B1" });
    const b = apiFor(app, two.actors.dev, two.projectId);
    expect((await b.updateTicket("TK-9", { title: "x" })).status).toBe(404);
    expect((await b.deleteTicket("TK-2")).status).toBe(404);
    expect((await b.addDependency("TK-1", "TK-2")).status).toBe(404);
    expect((await ticketRow(database, one.organizationId, "TK-1"))?.title).toBe("Intact");
    expect((await ticketRow(database, one.organizationId, "TK-2"))?.deleted_at).toBeNull();
    expect(
      await count(database, "ticket_dependencies", "organization_id = $1", [one.organizationId]),
    ).toBe(0);
    expect(
      await count(database, "ticket_dependencies", "organization_id = $1", [two.organizationId]),
    ).toBe(0);
  });
});

describe("entre projets d'une même organisation", () => {
  it("un second projet voit ses propres tickets : mêmes clés, aucune fuite, aucune dépendance croisée", async () => {
    const world = await createWorld(database);
    const secondProject = await insertProject(
      database,
      world.organizationId,
      "Second",
      "2026-06-01T00:00:00.000Z",
    );

    await seedTicket(app, world.actors.dev, world.projectId, { title: "Premier projet" });
    await seedTicket(app, world.actors.dev, world.projectId, { title: "Premier projet bis" });
    await seedSprint(app, world.actors.dev, world.projectId);
    // Même cookie, autre projet désigné.
    expect((await apiFor(app, world.actors.dev, secondProject).getTicket("TK-1")).status).toBe(404);
    expect((await apiFor(app, world.actors.dev, secondProject).getSprint("SP-1")).status).toBe(404);
    expect((await apiFor(app, world.actors.dev, secondProject).listTickets()).body.items).toEqual(
      [],
    );

    const second = await apiFor(app, world.actors.dev, secondProject).createTicket({
      title: "Second projet",
    });
    expect(second.body.key).toBe("TK-1");
    expect(
      (await apiFor(app, world.actors.dev, world.projectId).getTicket("TK-1")).body.title,
    ).toBe("Premier projet");

    // TK-2 n'existe que dans le premier projet : le second ne peut pas en dépendre.
    const cross = await apiFor(app, world.actors.dev, secondProject).addDependency("TK-1", "TK-2");
    expect(cross.status).toBe(404);
    expect(cross.body.code).toBe("NOT_FOUND");
    const crossSprint = await apiFor(app, world.actors.dev, secondProject).createTicket({
      sprintId: "SP-1",
    });
    expect(crossSprint.status).toBe(422);
    expect(
      await count(database, "ticket_dependencies", "organization_id = $1", [world.organizationId]),
    ).toBe(0);
  });
});

describe("entre projets d'une même organisation (suite 2)", () => {
  it("défense en profondeur : écrire sur le ticket d'un autre projet ne laisse aucune ligne enfant", async () => {
    const world = await createWorld(database);
    const secondProject = await insertProject(
      database,
      world.organizationId,
      "Second",
      "2026-06-01T00:00:00.000Z",
    );
    const foreign = await seedTicket(app, world.actors.dev, world.projectId, {
      labels: ["intact"],
    });

    const attempt = await apiFor(app, world.actors.dev, secondProject).updateTicket(foreign.key, {
      labels: ["pirate"],
      linkedFeatures: ["F-pirate"],
    });
    expect(attempt.status).toBe(404);
    const labels = await database.query<{ label: string }>(
      "SELECT label FROM ticket_labels WHERE ticket_id = $1",
      [foreign.id],
    );
    expect(labels.map((r) => r.label)).toEqual(["intact"]);
    expect(await count(database, "ticket_features", "ticket_id = $1", [foreign.id])).toBe(0);
    expect(
      await count(database, "audit_log", "organization_id = $1 AND action = 'ticket.update'", [
        world.organizationId,
      ]),
    ).toBe(0);
  });
});

describe("entre projets d'une même organisation (suite 3)", () => {
  it("défense en profondeur : un projet d'une autre organisation n'accepte aucune écriture", async () => {
    const mine = await createWorld(database);
    const theirs = await createWorld(database);
    // Le membre désigne explicitement le projet d'une autre organisation.
    const api = apiFor(app, mine.actors.dev, theirs.projectId);

    const created = await api.createTicket();
    expect(created.status).toBe(404);
    expect((await api.createSprint()).status).toBe(404);
    expect(await count(database, "tickets", "project_id = $1", [theirs.projectId])).toBe(0);
    expect(await count(database, "sprints", "project_id = $1", [theirs.projectId])).toBe(0);
    expect(await count(database, "project_counters", "project_id = $1", [theirs.projectId])).toBe(
      0,
    );
    expect((await api.listTickets()).body.items ?? []).toEqual([]);
  });
});
