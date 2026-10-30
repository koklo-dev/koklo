import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import {
  activeLeaseCount,
  auditCount,
  collaborationFor,
  createAppWithClock,
  leaseRows,
  ManualClock,
} from "./helpers/leases.ts";
import { insertActor } from "./helpers/organizations.ts";
import { apiFor, createWorld, seedTicket, type World } from "./helpers/tickets.ts";

/**
 * TK-31, critère R1 : la prise concurrente d'un bail ne produit qu'un gagnant, sans 500, sur base
 * réelle (index unique partiel + UPDATE conditionnels). L'expiration est une propriété de la
 * donnée évaluée à l'horloge injectée : aucun code de reprise (incident 3, annexe C §C.5).
 */
let database: TestDatabase;
let app: INestApplication;
const clock = new ManualClock();
const MINUTE = 60_000;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createAppWithClock(database.url, clock);
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

async function worldWithSecondDev(): Promise<
  World & { dev2: Awaited<ReturnType<typeof insertActor>> }
> {
  const world = await createWorld(database);
  const dev2 = await insertActor(database, world.organizationId, "dev", "dev2");
  return { ...world, dev2 };
}

describe("R1 : prise simultanée du même ticket par deux titulaires", () => {
  it("exactement un 200 et un 409 LEASE_HELD, une seule ligne active, une seule ligne d'audit, aucun 500", async () => {
    for (let round = 0; round < 5; round++) {
      const world = await worldWithSecondDev();
      const ticket = await seedTicket(app, world.actors.dev);
      const a = collaborationFor(app, world.actors.dev);
      const b = collaborationFor(app, world.dev2);

      const responses = await Promise.all([a.acquire(ticket.key), b.acquire(ticket.key)]);

      const statuses = responses.map((r) => r.status).sort();
      expect(statuses, JSON.stringify(responses.map((r) => r.body))).toEqual([200, 409]);
      const winner = responses.find((r) => r.status === 200);
      const loser = responses.find((r) => r.status === 409);
      expect(loser?.body.code).toBe("LEASE_HELD");
      expect(loser?.body.data).toEqual({
        ticket: ticket.key,
        holder: winner?.body.holder,
        expiresAt: winner?.body.expiresAt,
      });
      expect(winner?.body.holder.kind).toBe("member");
      expect([world.actors.dev.userId, world.dev2.userId]).toContain(winner?.body.holder.id);
      expect(await activeLeaseCount(database, ticket.id)).toBe(1);
      expect(await auditCount(database, world.organizationId, "lease.acquire")).toBe(1);
      expect(responses.some((r) => r.status >= 500)).toBe(false);
    }
  });

  it("variante même titulaire : deux requêtes identiques, une seule gagne, l'autre LEASE_HELD", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    const dev = collaborationFor(app, world.actors.dev);

    const responses = await Promise.all([dev.acquire(ticket.key), dev.acquire(ticket.key)]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(responses.find((r) => r.status === 409)?.body.code).toBe("LEASE_HELD");
    expect(await activeLeaseCount(database, ticket.id)).toBe(1);
    expect(await auditCount(database, world.organizationId, "lease.acquire")).toBe(1);
  });

  it("le même titulaire qui reprend un bail déjà actif reçoit LEASE_HELD (renouvellement par heartbeat)", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    const dev = collaborationFor(app, world.actors.dev);
    expect((await dev.acquire(ticket.key)).status).toBe(200);
    const again = await dev.acquire(ticket.key);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("LEASE_HELD");
    expect(again.body.data.holder).toEqual({ kind: "member", id: world.actors.dev.userId });
  });
});

describe("incident 3 : l'expiration libère le ticket sans code de reprise", () => {
  it("incident-3-expired-lease-frees-ticket-without-recovery", async () => {
    const world = await worldWithSecondDev();
    const ticket = await seedTicket(app, world.actors.dev);
    const first = collaborationFor(app, world.actors.dev);
    const second = collaborationFor(app, world.dev2);
    const acquired = await first.acquire(ticket.key, { ttlMs: 10 * MINUTE });
    expect(acquired.status).toBe(200);
    expect((await second.acquire(ticket.key)).status).toBe(409);

    // Aucun appel intermédiaire : seule l'horloge avance au-delà de expiresAt.
    clock.advance(10 * MINUTE + 1);

    expect((await second.getLease(ticket.key)).body).toBeNull();
    expect((await apiFor(app, world.actors.dev).getTicket(ticket.key)).body.lease).toBeNull();
    const taken = await second.acquire(ticket.key);
    expect(taken.status).toBe(200);
    expect(taken.body.holder.id).toBe(world.dev2.userId);

    const rows = await leaseRows(database, ticket.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.released_at).not.toBeNull();
    expect(rows[1]?.released_at).toBeNull();
    expect(await activeLeaseCount(database, ticket.id)).toBe(1);
  });

  it("deux prises simultanées sur un bail expiré : une seule gagne", async () => {
    for (let round = 0; round < 3; round++) {
      const world = await worldWithSecondDev();
      const third = await insertActor(database, world.organizationId, "admin", "admin2");
      const ticket = await seedTicket(app, world.actors.dev);
      expect(
        (await collaborationFor(app, world.actors.dev).acquire(ticket.key, { ttlMs: MINUTE }))
          .status,
      ).toBe(200);
      clock.advance(MINUTE + 1);

      const responses = await Promise.all([
        collaborationFor(app, world.dev2).acquire(ticket.key),
        collaborationFor(app, third).acquire(ticket.key),
      ]);

      expect(
        responses.map((r) => r.status).sort(),
        JSON.stringify(responses.map((r) => r.body)),
      ).toEqual([200, 409]);
      expect(responses.find((r) => r.status === 409)?.body.code).toBe("LEASE_HELD");
      expect(await activeLeaseCount(database, ticket.id)).toBe(1);
    }
  });
});

describe("défaut existant : un bail expiré non libéré n'est pas actif", () => {
  it("ticket.delete n'est plus refusé et ticket.get n'expose pas le bail expiré", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    const ticket = await seedTicket(app, world.actors.dev);
    const held = await seedTicket(app, world.actors.dev);
    await collaborationFor(app, world.actors.dev).acquire(ticket.key, { ttlMs: MINUTE });
    await collaborationFor(app, world.actors.dev).acquire(held.key, { ttlMs: 60 * MINUTE });
    expect((await dev.deleteTicket(held.key)).status).toBe(409);

    clock.advance(MINUTE + 1);

    expect((await dev.getTicket(ticket.key)).body.lease).toBeNull();
    expect((await dev.getTicket(held.key)).body.lease).not.toBeNull();
    expect((await dev.deleteTicket(ticket.key)).status).toBe(200);
  });
});
