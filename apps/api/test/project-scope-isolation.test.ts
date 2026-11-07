import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { commentsFor } from "./helpers/comments.ts";
import { collaborationFor } from "./helpers/leases.ts";
import { count } from "./helpers/organizations.ts";
import { apiFor, createWorld, insertProject, seedSprint, seedTicket } from "./helpers/tickets.ts";

/**
 * TK-96, critère C3 : le projet est explicite, donc deux projets d'une même organisation (et a
 * fortiori de deux organisations) ne se voient jamais : tickets, sprints, dépendances, commentaires,
 * état de projet, baux et audit. Les clés `TK-n` / `SP-n` sont propres à chaque projet.
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

/** Deux projets de la même organisation, le premier peuplé de toutes les ressources de pilotage. */
async function twoProjects() {
  const world = await createWorld(database);
  const other = await insertProject(
    database,
    world.organizationId,
    "Autre",
    "2026-06-01T00:00:00.000Z",
  );
  const owner = world.actors.owner;
  const a = world.projectId;
  const first = await seedTicket(app, owner, a, { title: "Ticket du projet A" });
  const second = await seedTicket(app, owner, a, { title: "Second du projet A" });
  const sprint = await seedSprint(app, owner, a);
  await apiFor(app, owner, a).addDependency(first.key, second.key);
  const comment = await commentsFor(app, owner, a).create(first.id, "Commentaire du projet A");
  const lease = collaborationFor(app, owner, a);
  await lease.acquire(first.key);
  await lease.getState();
  await lease.updateState(1, { secret: "etat-de-A" });
  return { world, a, b: other, owner, first, second, sprint, comment };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("deux projets d'une même organisation", () => {
  it("rien du projet A n'est lisible depuis le projet B", async () => {
    const { world, b, owner, first, sprint } = await twoProjects();
    const api = apiFor(app, owner, b);
    expect((await api.listTickets()).body.items).toEqual([]);
    expect((await api.getTicket(first.key)).status).toBe(404);
    expect((await api.listSprints()).body).toEqual([]);
    expect((await api.getSprint(sprint.key)).status).toBe(404);
    expect((await api.listDependencies(first.key)).status).toBe(404);
    expect((await commentsFor(app, owner, b).list(first.id)).status).toBe(404);
    expect((await collaborationFor(app, owner, b).getLease(first.key)).status).toBe(404);
    // L'état de B est le sien : version initiale, contenu vide.
    expect((await collaborationFor(app, owner, b).getState()).body).toEqual({
      version: 1,
      content: {},
    });
    expect(
      JSON.stringify((await apiFor(app, world.actors.admin, b).listTickets()).body),
    ).not.toContain("projet A");
  });

  it("les mêmes clés TK-1 / SP-1 désignent deux ressources distinctes", async () => {
    const { b, owner, a } = await twoProjects();
    const created = await apiFor(app, owner, b).createTicket({ title: "Ticket du projet B" });
    expect(created.body.key).toBe("TK-1");
    expect((await apiFor(app, owner, b).createSprint({ goal: "Objectif de B" })).body.key).toBe(
      "SP-1",
    );
    expect((await apiFor(app, owner, a).getTicket("TK-1")).body.title).toBe("Ticket du projet A");
    expect((await apiFor(app, owner, b).getTicket("TK-1")).body.title).toBe("Ticket du projet B");
    expect((await apiFor(app, owner, a).getSprint("SP-1")).body.goal).not.toBe("Objectif de B");
  });

  it("aucune écriture de B ne touche A : dépendance, sprint, commentaire, bail refusés", async () => {
    const { world, a, b, owner, first, second, sprint, comment } = await twoProjects();
    const api = apiFor(app, owner, b);
    expect((await api.updateTicket(first.key, { title: "Pirate" })).status).toBe(404);
    expect((await api.transition(first.key, "in_progress")).status).toBe(404);
    expect((await api.deleteTicket(first.key)).status).toBe(404);
    expect((await api.addDependency(first.key, second.key)).status).toBe(404);
    expect((await api.removeDependency(first.key, second.key)).status).toBe(404);
    expect((await api.activateSprint(sprint.key)).status).toBe(404);
    expect((await api.closeSprint(sprint.key)).status).toBe(404);
    expect((await commentsFor(app, owner, b).create(first.id)).status).toBe(404);
    expect((await commentsFor(app, owner, b).remove(comment.body.id)).status).toBe(404);
    expect((await collaborationFor(app, owner, b).heartbeat(first.key)).status).toBe(404);
    expect((await collaborationFor(app, owner, b).release(first.key)).status).toBe(404);
    // Un ticket de B ne peut pas viser le sprint de A.
    expect((await api.createTicket({ sprintId: sprint.key })).status).toBe(422);
    const intact = await apiFor(app, owner, a).getTicket(first.key);
    expect(intact.body.title).toBe("Ticket du projet A");
    expect(
      await count(database, "ticket_dependencies", "organization_id = $1", [world.organizationId]),
    ).toBe(1);
  });

  it("l'état de projet est propre à chaque projet", async () => {
    const { a, b, owner } = await twoProjects();
    expect((await collaborationFor(app, owner, a).getState()).body.content).toEqual({
      secret: "etat-de-A",
    });
    const updated = await collaborationFor(app, owner, b).updateState(1, { autre: true });
    expect(updated.status).toBe(200);
    expect((await collaborationFor(app, owner, a).getState()).body.content).toEqual({
      secret: "etat-de-A",
    });
  });

  it("l'audit d'un projet ne montre jamais les écritures de l'autre, et porte le projet de la requête", async () => {
    const { world, a, b, owner, first, second } = await twoProjects();
    const created = await apiFor(app, owner, b).createTicket({ title: "Ticket du projet B" });
    const ids = async (projectId: string) =>
      (await commentsFor(app, owner, projectId).listAudit("limit=100")).body.items.map(
        (item: { targetId: string }) => item.targetId,
      );
    const auditA = await ids(a);
    const auditB = await ids(b);
    expect(auditA).toContain(first.id);
    expect(auditA).not.toContain(created.body.id);
    expect(auditB).toContain(created.body.id);
    expect(auditB).not.toContain(first.id);
    const rows = await database.query<{ project_id: string | null }>(
      "SELECT project_id FROM audit_log WHERE organization_id = $1 AND target_id = $2",
      [world.organizationId, created.body.id],
    );
    expect(rows.map((r) => r.project_id)).toEqual([b]);
    // Le filtre par clé de ticket vise le projet demandé.
    expect(
      (await commentsFor(app, owner, b).listAudit(`ticketKey=${second.key}`)).body.items,
    ).toEqual([]);
  });
});

describe("deux organisations", () => {
  it("un membre de X n'atteint rien de Y en désignant son projet, et n'y écrit rien", async () => {
    const x = await createWorld(database);
    const y = await createWorld(database);
    const seeded = await seedTicket(app, y.actors.owner, y.projectId, { title: "Secret de Y" });
    await seedSprint(app, y.actors.owner, y.projectId);
    const api = apiFor(app, x.actors.owner, y.projectId);

    for (const res of [
      await api.listTickets(),
      await api.getTicket(seeded.key),
      await api.listSprints(),
      await api.createTicket({ title: "Intrusion" }),
      await api.createSprint({ goal: "Intrusion" }),
      await commentsFor(app, x.actors.owner, y.projectId).create(seeded.id),
      await commentsFor(app, x.actors.owner, y.projectId).listAudit(),
      await collaborationFor(app, x.actors.owner, y.projectId).getState(),
      await collaborationFor(app, x.actors.owner, y.projectId).acquire(seeded.key),
    ]) {
      expect(res.status, JSON.stringify(res.body)).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain("Secret de Y");
    }
    expect(await count(database, "tickets", "project_id = $1", [y.projectId])).toBe(1);
    expect(await count(database, "sprints", "project_id = $1", [y.projectId])).toBe(1);
    expect(await count(database, "leases", "organization_id = $1", [y.organizationId])).toBe(0);
  });
});
