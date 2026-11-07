import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { shapeOf } from "./helpers/client-scene.ts";
import { commentsFor } from "./helpers/comments.ts";
import { insertActor } from "./helpers/organizations.ts";
import {
  type Call,
  contractProcedures,
  FAKE,
  PROCEDURES,
  type Procedure,
  pathOf,
  prepare,
  unknownProject,
} from "./helpers/project-scope.ts";
import {
  apiFor,
  createWorld,
  insertProject,
  linkClient,
  send,
  type World,
} from "./helpers/tickets.ts";

/**
 * TK-96, critère C4/C5 : chacune des 25 procédures de pilotage résout le projet depuis l'entrée
 * (`projectId`) et contrôle l'accès côté serveur. Règle unique, consignée dans questions.md : un
 * projet inaccessible (inconnu, d'une autre organisation, non lié à un client) répond TOUJOURS
 * 404 NOT_FOUND au même corps ; 403 est réservé au rôle insuffisant, qui ne dépend pas du projet.
 */
let database: TestDatabase;
let app: INestApplication;
let mine: World;
let theirs: World;
let linkedClient: Awaited<ReturnType<typeof insertActor>>;
let secondProject: string;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  mine = await createWorld(database, { linkedClient: false });
  theirs = await createWorld(database);
  linkedClient = await insertActor(database, mine.organizationId, "client", "client-linked");
  await linkClient(database, mine.organizationId, mine.projectId, linkedClient.userId);
  secondProject = await insertProject(database, mine.organizationId, "Second");
}, 120_000);

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const run = (actor: { cookie: string }, projectId: string, call: Call) =>
  send(app, actor.cookie, call.method, pathOf(projectId, call), call.body);

const NAMES = PROCEDURES.map((p) => p.name);
const each = PROCEDURES.map((p) => [p.name, p] as const);

describe("la liste des 25 procédures est complète (garde contre le contrat)", () => {
  it("couvre exactement les groupes ticket, dependency, sprint, comment, projectState, lease, audit", () => {
    expect(NAMES.length).toBe(25);
    expect([...NAMES].sort()).toEqual(contractProcedures());
  });
});

describe.each(each)("%s", (_name, procedure: Procedure) => {
  it("membre d'une autre organisation : 404 au même corps que pour un projet inexistant", async () => {
    const call = procedure.call(FAKE);
    const foreign = await run(theirs.actors.owner, mine.projectId, call);
    const unknown = await run(theirs.actors.owner, unknownProject(), call);
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(404);
    expect(foreign.body.code).toBe("NOT_FOUND");
    expect(shapeOf(foreign)).toEqual(shapeOf(unknown));
    expect(JSON.stringify(foreign.body)).not.toContain(mine.projectId);
  });

  it("client non lié : 404 (lecture, commentaire) ou 403 (rôle insuffisant), jamais l'accès", async () => {
    const call = procedure.call(FAKE);
    const unlinked = await run(mine.actors.client, mine.projectId, call);
    const unknown = await run(mine.actors.client, unknownProject(), call);
    const expected = procedure.client === 403 ? 403 : 404;
    expect(unlinked.status, JSON.stringify(unlinked.body)).toBe(expected);
    // Même corps que pour un projet inexistant : le projet ne se devine pas (hors rôle refusé avant).
    expect(shapeOf(unlinked)).toEqual(shapeOf(unknown));
  });

  it("membre d'équipe du projet : accès accordé (200)", async () => {
    const world = await createWorld(database);
    const f = await prepare(app, world, world.actors.owner);
    if (procedure.setup) await procedure.setup(apiFor(app, world.actors.owner, world.projectId), f);
    const res = await run(world.actors.owner, world.projectId, procedure.call(f));
    expect(res.status, `${procedure.name} : ${JSON.stringify(res.body)}`).toBe(200);
  });

  it("client lié à son projet : la règle de rôle habituelle, rien de plus", async () => {
    const world = await createWorld(database);
    const f = await prepare(app, world, world.actors.owner);
    if (procedure.setup) await procedure.setup(apiFor(app, world.actors.owner, world.projectId), f);
    const commentId =
      procedure.client === "own"
        ? (await commentsFor(app, world.actors.client, world.projectId).create(f.t1Id)).body.id
        : f.commentId;
    const res = await run(
      world.actors.client,
      world.projectId,
      procedure.call({ ...f, commentId }),
    );
    expect(res.status, `${procedure.name} : ${JSON.stringify(res.body)}`).toBe(
      procedure.client === 403 ? 403 : 200,
    );
  });

  it("client lié à un autre projet de l'organisation : 404 (lecture) ou 403 (rôle)", async () => {
    const call = procedure.call(FAKE);
    const res = await run(linkedClient, secondProject, call);
    expect(res.status).toBe(procedure.client === 403 ? 403 : 404);
  });
});
