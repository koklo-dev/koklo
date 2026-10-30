import { leaseSchema } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import { collaborationFor, createAppWithClock, leaseRows, ManualClock } from "./helpers/leases.ts";
import { insertActor } from "./helpers/organizations.ts";
import { apiFor, createWorld, seedTicket } from "./helpers/tickets.ts";

/** TK-31 : cycle de vie acquire / heartbeat / release / get et erreurs typées. */
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

describe("cycle de vie", () => {
  it("acquire pose un bail de 15 minutes par défaut au nom de la session, get le relit", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    const dev = collaborationFor(app, world.actors.dev);
    const at = clock.now();

    const acquired = await dev.acquire(ticket.key);

    expect(acquired.status).toBe(200);
    expect(leaseSchema.safeParse(acquired.body).success).toBe(true);
    expect(acquired.body).toEqual({
      ticket: ticket.key,
      holder: { kind: "member", id: world.actors.dev.userId },
      branch: "feat/tk-x",
      worktree: "/srv/worktrees/tk-x",
      acquiredAt: at,
      heartbeatAt: at,
      expiresAt: new Date(Date.parse(at) + 900_000).toISOString(),
      ttlMs: 900_000,
      released: false,
    });
    expect((await dev.getLease(ticket.key)).body).toEqual(acquired.body);
  });

  it("acquire honore ttlMs", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    const response = await collaborationFor(app, world.actors.dev).acquire(ticket.key, {
      ttlMs: 5 * MINUTE,
    });
    expect(response.body.ttlMs).toBe(5 * MINUTE);
    expect(Date.parse(response.body.expiresAt) - Date.parse(response.body.acquiredAt)).toBe(
      5 * MINUTE,
    );
  });
});

describe("cycle de vie (heartbeat)", () => {
  it("heartbeat repousse expiresAt à now + ttl sans toucher acquiredAt", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    const dev = collaborationFor(app, world.actors.dev);
    const acquired = (await dev.acquire(ticket.key, { ttlMs: 10 * MINUTE })).body;

    clock.advance(6 * MINUTE);
    const beat = await dev.heartbeat(ticket.key);

    expect(beat.status).toBe(200);
    expect(beat.body.acquiredAt).toBe(acquired.acquiredAt);
    expect(beat.body.heartbeatAt).toBe(clock.now());
    expect(beat.body.expiresAt).toBe(new Date(Date.parse(clock.now()) + 10 * MINUTE).toISOString());
    // Le bail survit au TTL initial grâce au battement.
    clock.advance(6 * MINUTE);
    expect((await dev.getLease(ticket.key)).body).not.toBeNull();
  });

  it("release libère le bail (released: true) et le ticket redevient prenable", async () => {
    const world = await createWorld(database);
    const other = await insertActor(database, world.organizationId, "dev", "dev2");
    const ticket = await seedTicket(app, world.actors.dev);
    const dev = collaborationFor(app, world.actors.dev);
    await dev.acquire(ticket.key);

    const released = await dev.release(ticket.key);

    expect(released.status).toBe(200);
    expect(released.body.released).toBe(true);
    expect((await dev.getLease(ticket.key)).body).toBeNull();
    const rows = await leaseRows(database, ticket.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.released_at).not.toBeNull();
    expect((await collaborationFor(app, other).acquire(ticket.key)).status).toBe(200);
  });
});

describe("cycle de vie (release)", () => {
  it("release d'un bail déjà libéré ou expiré : NOT_FOUND", async () => {
    const world = await createWorld(database);
    const dev = collaborationFor(app, world.actors.dev);
    const first = await seedTicket(app, world.actors.dev);
    await dev.acquire(first.key);
    await dev.release(first.key);
    expect((await dev.release(first.key)).status).toBe(404);

    const second = await seedTicket(app, world.actors.dev);
    await dev.acquire(second.key, { ttlMs: MINUTE });
    clock.advance(MINUTE + 1);
    const expired = await dev.release(second.key);
    expect(expired.status).toBe(404);
    expect(expired.body.code).toBe("NOT_FOUND");
  });

  it("get renvoie null sans bail", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    const response = await collaborationFor(app, world.actors.dev).getLease(ticket.key);
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });

  it("ticket.get reflète le bail pris par lease.acquire", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    const acquired = await collaborationFor(app, world.actors.dev).acquire(ticket.key);
    expect((await apiFor(app, world.actors.dev).getTicket(ticket.key)).body.lease).toEqual(
      acquired.body,
    );
  });
});

describe("erreurs typées", () => {
  it("LEASE_NOT_HOLDER : heartbeat et release par un autre que le titulaire (owner et admin compris)", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    await collaborationFor(app, world.actors.dev).acquire(ticket.key);
    const holder = { kind: "member", id: world.actors.dev.userId };

    for (const role of ["owner", "admin"] as const) {
      const other = collaborationFor(app, world.actors[role]);
      for (const response of [await other.heartbeat(ticket.key), await other.release(ticket.key)]) {
        expect(response.status).toBe(403);
        expect(response.body.code).toBe("LEASE_NOT_HOLDER");
        expect(response.body.data).toEqual({ ticket: ticket.key, holder });
      }
    }
    expect(
      (await collaborationFor(app, world.actors.dev).getLease(ticket.key)).body,
    ).not.toBeNull();
  });

  it("LEASE_EXPIRED : heartbeat après expiration ou après release, avec expiresAt", async () => {
    const world = await createWorld(database);
    const dev = collaborationFor(app, world.actors.dev);
    const expiring = await seedTicket(app, world.actors.dev);
    const acquired = await dev.acquire(expiring.key, { ttlMs: MINUTE });
    clock.advance(MINUTE + 1);
    const late = await dev.heartbeat(expiring.key);
    expect(late.status).toBe(409);
    expect(late.body.code).toBe("LEASE_EXPIRED");
    expect(late.body.data).toEqual({ ticket: expiring.key, expiresAt: acquired.body.expiresAt });

    const freed = await seedTicket(app, world.actors.dev);
    await dev.acquire(freed.key);
    await dev.release(freed.key);
    expect((await dev.heartbeat(freed.key)).body.code).toBe("LEASE_EXPIRED");
  });
});

describe("erreurs typées (suite 2)", () => {
  it("NOT_FOUND : ticket inconnu ou supprimé, pour acquire, heartbeat, release et get", async () => {
    const world = await createWorld(database);
    const dev = collaborationFor(app, world.actors.dev);
    const deleted = await seedTicket(app, world.actors.dev);
    await apiFor(app, world.actors.dev).deleteTicket(deleted.key);
    for (const key of ["TK-999", deleted.key]) {
      for (const response of [
        await dev.acquire(key),
        await dev.heartbeat(key),
        await dev.release(key),
        await dev.getLease(key),
      ]) {
        expect(response.status).toBe(404);
        expect(response.body.code).toBe("NOT_FOUND");
      }
    }
  });

  it("entrées invalides : aucun bail créé", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    const dev = collaborationFor(app, world.actors.dev);
    for (const over of [
      { branch: "" },
      { worktree: "" },
      { ttlMs: 0 },
      { ttlMs: -5 },
      { ttlMs: 1.5 },
    ]) {
      const response = await dev.acquire(ticket.key, over);
      expect([400, 422]).toContain(response.status);
    }
    expect(await leaseRows(database, ticket.id)).toHaveLength(0);
  });

  it("UNAUTHORIZED sans session", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    const anonymous = collaborationFor(app, undefined);
    for (const response of [
      await anonymous.acquire(ticket.key),
      await anonymous.heartbeat(ticket.key),
      await anonymous.release(ticket.key),
      await anonymous.getLease(ticket.key),
      await anonymous.getState(),
      await anonymous.updateState(1, {}),
    ]) {
      expect(response.status).toBe(401);
    }
  });
});
