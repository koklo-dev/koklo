import { dependencySchema } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { count } from "./helpers/organizations.ts";
import { apiFor, createWorld, seedTicket, type World } from "./helpers/tickets.ts";

/** TK-30 : dépendances (CDC §7.2), cycles, suppression logique et table H1 des transitions. */
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

async function chain(size: number) {
  const world = await createWorld(database);
  const dev = apiFor(app, world.actors.dev);
  const keys: string[] = [];
  for (let i = 0; i < size; i++) {
    keys.push((await seedTicket(app, world.actors.dev, { status: "backlog" })).key);
  }
  return { world, dev, keys };
}

const edges = (world: World) =>
  count(database, "ticket_dependencies", "organization_id = $1", [world.organizationId]);

describe("dependency.add / list / remove", () => {
  it("ajoute une arête, la liste, et ré-ajouter la même arête est idempotent", async () => {
    const { world, dev, keys } = await chain(2);
    const [a, b] = keys as [string, string];
    const added = await dev.addDependency(a, b, "blocks");
    expect(added.status).toBe(200);
    expect(added.body).toEqual({ ticket: a, dependsOn: b, type: "blocks" });
    expect(dependencySchema.safeParse(added.body).success).toBe(true);

    const again = await dev.addDependency(a, b, "blocks");
    expect(again.status).toBe(200);
    expect(again.body).toEqual(added.body);
    expect(await edges(world)).toBe(1);

    const listed = await dev.listDependencies(a);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([{ ticket: a, dependsOn: b, type: "blocks" }]);
  });

  it("une dépendance related ne bloque jamais la transition", async () => {
    const { dev, keys } = await chain(2);
    const [a, b] = keys as [string, string];
    expect((await dev.addDependency(a, b, "related")).status).toBe(200);
    // Les tickets de `chain` naissent en backlog : on les passe en todo (H1).
    expect((await dev.transition(a, "todo")).status).toBe(200);
    expect((await dev.transition(a, "in_progress")).status).toBe(200);
  });

  it("une dépendance annulée (cancelled) ne satisfait pas la règle", async () => {
    const { dev, keys } = await chain(2);
    const [a, b] = keys as [string, string];
    await dev.addDependency(a, b, "blocks");
    expect((await dev.transition(b, "cancelled")).status).toBe(200);
    expect((await dev.transition(a, "todo")).status).toBe(200);
    const refused = await dev.transition(a, "in_progress");
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("INVALID_TRANSITION");
  });
});

describe("dependency.add / list / remove (suite 2)", () => {
  it("retirer l'arête débloque la transition ; retirer une arête absente est NOT_FOUND", async () => {
    const { dev, keys } = await chain(2);
    const [a, b] = keys as [string, string];
    await dev.addDependency(a, b, "blocks");
    await dev.transition(a, "todo");
    expect((await dev.transition(a, "in_progress")).status).toBe(409);

    const removed = await dev.removeDependency(a, b, "blocks");
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ key: a, dependsOn: b, type: "blocks" });
    expect((await dev.transition(a, "in_progress")).status).toBe(200);

    const missing = await dev.removeDependency(a, b, "blocks");
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("NOT_FOUND");
  });

  it("refuse une auto-dépendance sans rien écrire", async () => {
    const { world, dev, keys } = await chain(1);
    const [a] = keys as [string];
    const response = await dev.addDependency(a, a, "blocks");
    expect([400, 422]).toContain(response.status);
    expect(await edges(world)).toBe(0);
  });

  it("une clé inconnue est NOT_FOUND, côté ticket comme côté dépendance", async () => {
    const { world, dev, keys } = await chain(1);
    const [a] = keys as [string];
    const unknownTarget = await dev.addDependency(a, "TK-999", "blocks");
    expect(unknownTarget.status).toBe(404);
    expect(unknownTarget.body.code).toBe("NOT_FOUND");
    const unknownSource = await dev.addDependency("TK-999", a, "blocks");
    expect(unknownSource.status).toBe(404);
    expect((await dev.listDependencies("TK-999")).status).toBe(404);
    expect(await edges(world)).toBe(0);
  });
});

describe("cycles", () => {
  it("refuse la fermeture d'un cycle A->B->C par C->A avec le chemin", async () => {
    const { world, dev, keys } = await chain(3);
    const [a, b, c] = keys as [string, string, string];
    expect((await dev.addDependency(a, b)).status).toBe(200);
    expect((await dev.addDependency(b, c)).status).toBe(200);

    const cycle = await dev.addDependency(c, a);
    expect(cycle.status).toBe(409);
    expect(cycle.body.code).toBe("DEPENDENCY_CYCLE");
    expect(cycle.body.data.path).toEqual(expect.arrayContaining([a, b, c]));
    expect(await edges(world)).toBe(2);
  });

  it("refuse un cycle direct A->B puis B->A", async () => {
    const { dev, keys } = await chain(2);
    const [a, b] = keys as [string, string];
    await dev.addDependency(a, b);
    const cycle = await dev.addDependency(b, a);
    expect(cycle.status).toBe(409);
    expect(cycle.body.code).toBe("DEPENDENCY_CYCLE");
  });

  it("un ticket supprimé ne participe plus à la détection de cycle (H6)", async () => {
    const { world, dev, keys } = await chain(3);
    const [a, b, c] = keys as [string, string, string];
    await dev.addDependency(a, b);
    await dev.addDependency(b, c);
    expect((await dev.deleteTicket(b)).status).toBe(200);
    const closes = await dev.addDependency(c, a);
    expect(closes.status).toBe(200);
    // Les arêtes du ticket supprimé restent en base (suppression logique, pas de cascade).
    expect(await edges(world)).toBe(3);
  });
});

describe("tickets supprimés et dépendances", () => {
  it("l'arête vers un ticket supprimé ne bloque plus personne", async () => {
    const { dev, keys } = await chain(2);
    const [a, b] = keys as [string, string];
    await dev.addDependency(a, b, "blocks");
    await dev.transition(a, "todo");
    expect((await dev.transition(a, "in_progress")).status).toBe(409);
    expect((await dev.deleteTicket(b)).status).toBe(200);
    expect((await dev.transition(a, "in_progress")).status).toBe(200);
  });

  it("ajouter une dépendance vers un ticket supprimé est NOT_FOUND", async () => {
    const { dev, keys } = await chain(2);
    const [a, b] = keys as [string, string];
    await dev.deleteTicket(b);
    const response = await dev.addDependency(a, b);
    expect(response.status).toBe(404);
    expect(response.body.code).toBe("NOT_FOUND");
  });

  it("les dépendances d'un ticket supprimé ne se listent plus (NOT_FOUND)", async () => {
    const { dev, keys } = await chain(2);
    const [a, b] = keys as [string, string];
    await dev.addDependency(a, b);
    await dev.deleteTicket(a);
    expect((await dev.listDependencies(a)).status).toBe(404);
  });
});

describe("ticket.transition : table H1 et retours", () => {
  it("refuse backlog -> done et toute sortie de done avec {from,to}", async () => {
    const { dev, keys } = await chain(1);
    const [a] = keys as [string];
    const skipped = await dev.transition(a, "done");
    expect(skipped.status).toBe(409);
    expect(skipped.body.code).toBe("INVALID_TRANSITION");
    expect(skipped.body.data).toEqual({ from: "backlog", to: "done" });

    for (const to of ["todo", "in_progress", "in_review", "done"]) {
      expect((await dev.transition(a, to)).status).toBe(200);
    }
    const fromDone = await dev.transition(a, "todo");
    expect(fromDone.status).toBe(409);
    expect(fromDone.body.data).toEqual({ from: "done", to: "todo" });
  });

  it("les retours en arrière ne sont jamais bloqués par une dépendance ajoutée après coup (H4)", async () => {
    const { dev, keys } = await chain(2);
    const [a, b] = keys as [string, string];
    await dev.transition(a, "todo");
    await dev.transition(a, "in_progress");
    expect((await dev.addDependency(a, b, "blocks")).status).toBe(200);
    // Le ticket déjà avancé n'est pas rétrogradé, et peut revenir en arrière ou se bloquer.
    expect((await dev.getTicket(a)).body.status).toBe("in_progress");
    expect((await dev.transition(a, "blocked")).status).toBe(200);
    expect((await dev.transition(a, "todo")).status).toBe(200);
  });

  it("transition vers un statut inconnu : 4xx et statut inchangé", async () => {
    const { dev, keys } = await chain(1);
    const [a] = keys as [string];
    const response = await dev.transition(a, "archived");
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect((await dev.getTicket(a)).body.status).toBe("backlog");
  });
});
