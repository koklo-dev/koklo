import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { apiFor, createWorld, ticketRow, type World } from "./helpers/tickets.ts";

/**
 * TK-30, critère d'acceptation : un sprint SP-1 et trois tickets chaînés TK-1 <- TK-2 <- TK-3
 * (type `blocks`) sur une base réelle, session de rôle `dev` ; todo -> in_progress est autorisé par
 * la table H1, donc seul un refus fondé sur les dépendances prouve la règle.
 */
let database: TestDatabase;
let app: INestApplication;
let world: World;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  world = await createWorld(database);
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

async function statusOf(key: string) {
  return (await ticketRow(database, world.organizationId, key))?.status;
}

describe("critère d'acceptation : transitions bloquées par les dépendances", () => {
  it("le sprint SP-1 et trois tickets chaînés refusent puis acceptent in_progress selon les dépendances", async () => {
    const dev = apiFor(app, world.actors.dev);

    // 1. Sprint SP-1 planned, puis activé.
    const sprint = await dev.createSprint({ goal: "Livrer la chaîne" });
    expect(sprint.status).toBe(200);
    expect(sprint.body).toMatchObject({ key: "SP-1", status: "planned" });
    const activated = await dev.activateSprint("SP-1");
    expect(activated.status).toBe(200);
    expect(activated.body).toMatchObject({ key: "SP-1", status: "active" });

    // 2. Trois tickets todo dans ce sprint, TK-2 dépend de TK-1, TK-3 dépend de TK-2.
    for (const expectedKey of ["TK-1", "TK-2", "TK-3"]) {
      const created = await dev.createTicket({ status: "todo", sprintId: "SP-1" });
      expect(created.status).toBe(200);
      expect(created.body).toMatchObject({ key: expectedKey, status: "todo", sprint: "SP-1" });
    }
    expect((await dev.addDependency("TK-2", "TK-1", "blocks")).status).toBe(200);
    expect((await dev.addDependency("TK-3", "TK-2", "blocks")).status).toBe(200);

    // 3. Refus tant que la dépendance bloquante n'est pas done.
    for (const key of ["TK-2", "TK-3"]) {
      const refused = await dev.transition(key, "in_progress");
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe("INVALID_TRANSITION");
      expect(refused.body.data).toEqual({ from: "todo", to: "in_progress" });
      expect(await statusOf(key)).toBe("todo");
    }

    // 4. TK-1 avance jusqu'à done ; TK-2 devient possible, TK-3 reste refusé.
    for (const to of ["in_progress", "in_review", "done"]) {
      const step = await dev.transition("TK-1", to);
      expect(step.status).toBe(200);
      expect(step.body).toMatchObject({ key: "TK-1", status: to });
    }
    const second = await dev.transition("TK-2", "in_progress");
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ key: "TK-2", status: "in_progress" });

    const stillRefused = await dev.transition("TK-3", "in_progress");
    expect(stillRefused.status).toBe(409);
    expect(stillRefused.body.code).toBe("INVALID_TRANSITION");
    expect(await statusOf("TK-3")).toBe("todo");

    // 5. TK-2 done, puis TK-3 accepté.
    expect((await dev.transition("TK-2", "in_review")).status).toBe(200);
    expect((await dev.transition("TK-2", "done")).status).toBe(200);
    const third = await dev.transition("TK-3", "in_progress");
    expect(third.status).toBe(200);
    expect(third.body).toMatchObject({ key: "TK-3", status: "in_progress" });
    expect(await statusOf("TK-3")).toBe("in_progress");
  });
});
