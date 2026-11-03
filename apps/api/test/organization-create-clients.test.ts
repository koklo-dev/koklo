import { randomUUID } from "node:crypto";
import type { Role } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { createClientScene, STAFF } from "./helpers/client-scene.ts";
import {
  call,
  count,
  insertActor,
  insertOrganization,
  insertSessionWithoutOrganization,
} from "./helpers/organizations.ts";

/**
 * TK-55 (« un client ne peut pas éditer ») : `organization.create` est fermée à l'utilisateur dont
 * TOUTES les appartenances sont `client`. Le rôle est par organisation, relu en base à chaque appel.
 * Un utilisateur sans appartenance (premier compte) et un utilisateur ayant au moins une appartenance
 * d'équipe restent autorisés. Un refus n'écrit rien (organisation, membre, audit).
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

const create = (cookie: string, name = `Org ${randomUUID()}`) =>
  call(app, cookie, "post", "/organizations", { name });

const totals = async () => ({
  organizations: await count(database, "organizations"),
  members: await count(database, "members"),
  audit: await count(database, "audit_log"),
});

/** Un utilisateur dont chaque appartenance a le rôle donné, dans une organisation neuve chacune. */
async function userWith(...roles: string[]) {
  const first = await insertOrganization(database, `oc-${randomUUID()}`);
  const actor = await insertActor(database, first, "dev", "multi");
  await database.query("UPDATE members SET role = $2 WHERE id = $1", [actor.memberId, roles[0]]);
  for (const role of roles.slice(1)) {
    const org = await insertOrganization(database, `oc-${randomUUID()}`);
    await database.query(
      `INSERT INTO members (id, organization_id, user_id, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())`,
      [randomUUID(), org, actor.userId, role],
    );
  }
  return actor;
}

describe("organization.create refusée à l'utilisateur uniquement client", () => {
  it("client lié à un projet : 403 FORBIDDEN, rien n'est créé", async () => {
    const scene = await createClientScene(database);
    const before = await totals();
    const res = await create(scene.c1.cookie);
    expect(res.status, res.text).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(await totals()).toEqual(before);
  });

  it("client sans projet lié : 403 FORBIDDEN, rien n'est créé", async () => {
    const scene = await createClientScene(database);
    const before = await totals();
    const res = await create(scene.c3.cookie);
    expect(res.status, res.text).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(await totals()).toEqual(before);
  });

  it("client dans deux organisations : toujours refusé", async () => {
    const actor = await userWith("client", "client");
    const before = await totals();
    expect((await create(actor.cookie)).status).toBe(403);
    expect(await totals()).toEqual(before);
  });

  it("nom ET slug fournis : le refus précède la résolution du slug (pas d'oracle 409)", async () => {
    const scene = await createClientScene(database);
    const taken = await insertOrganization(database, `taken-${randomUUID()}`);
    const slugRow = await database.query<{ slug: string }>(
      "SELECT slug FROM organizations WHERE id = $1",
      [taken],
    );
    const res = await call(app, scene.c1.cookie, "post", "/organizations", {
      name: "X",
      slug: slugRow[0]?.slug,
    });
    expect(res.status).toBe(403);
  });

  it("le refus est neutre : même corps pour tous les clients, rien sur d'autres organisations", async () => {
    const scene = await createClientScene(database);
    const bodies = new Set<string>();
    for (const client of [scene.c1, scene.c2, scene.c3, scene.foreign.client]) {
      const res = await create(client.cookie);
      expect(res.status).toBe(403);
      bodies.add(res.text);
    }
    expect(bodies.size).toBe(1);
    const [body] = [...bodies];
    expect(body).not.toContain(scene.organizationId);
    expect(body).not.toContain(scene.foreign.organizationId);
    expect(body).not.toContain("tk55a-");
  });
});

describe("organization.create : rôles lus en base, fail-closed", () => {
  it.each(["member", "Client", "OWNER", "client,owner", "owner,client", " owner", ""])(
    "rôle %j (inconnu, casse, multiple, vide) : refusé, fail-closed",
    async (role) => {
      const actor = await userWith(role);
      const before = await totals();
      expect((await create(actor.cookie)).status, role).toBe(403);
      expect(await totals()).toEqual(before);
    },
  );

  it("le rôle est relu en base : un owner rétrogradé en client est refusé avec la même session", async () => {
    const actor = await userWith("owner");
    await database.query("UPDATE members SET role = 'client' WHERE id = $1", [actor.memberId]);
    const before = await totals();
    expect((await create(actor.cookie)).status).toBe(403);
    expect(await totals()).toEqual(before);
  });

  it("un champ role / userId glissé dans l'entrée n'ouvre rien", async () => {
    const scene = await createClientScene(database);
    const before = await totals();
    const res = await call(app, scene.c1.cookie, "post", "/organizations", {
      name: "Pirate",
      role: "owner",
      userId: scene.staff.owner.userId,
      organizationId: scene.organizationId,
    });
    expect(res.status).toBe(403);
    expect(await totals()).toEqual(before);
  });

  it("aucune entrée d'audit organization.create n'est écrite pour le refus", async () => {
    const scene = await createClientScene(database);
    const before = await count(database, "audit_log", "action = 'organization.create'");
    await create(scene.c1.cookie);
    expect(await count(database, "audit_log", "action = 'organization.create'")).toBe(before);
  });
});

describe("organization.create reste ouverte aux autres", () => {
  it("utilisateur sans aucune appartenance (premier compte) : 200", async () => {
    const { cookie, userId } = await insertSessionWithoutOrganization(database);
    const res = await create(cookie, "Première org");
    expect(res.status, res.text).toBe(200);
    const roles = await database.query<{ role: string }>(
      "SELECT role FROM members WHERE user_id = $1",
      [userId],
    );
    expect(roles.map((r) => r.role)).toEqual(["owner"]);
  });

  it.each([...STAFF] satisfies Role[])("rôle %s : 200", async (role) => {
    const actor = await userWith(role);
    const res = await create(actor.cookie);
    expect(res.status, res.text).toBe(200);
  });

  it("client dans l'organisation A mais membre d'équipe dans B : 200", async () => {
    const actor = await userWith("client", "dev");
    const res = await create(actor.cookie);
    expect(res.status, res.text).toBe(200);
  });

  it("l'ordre des appartenances n'importe pas (équipe d'abord, client ensuite) : 200", async () => {
    const actor = await userWith("business", "client");
    expect((await create(actor.cookie)).status).toBe(200);
  });
});

describe("canal Better Auth : la création d'organisation reste fermée au client", () => {
  it("POST /api/auth/organization/create : 403 et aucune organisation créée", async () => {
    const scene = await createClientScene(database);
    const before = await totals();
    for (const client of [scene.c1, scene.c3]) {
      const res = await call(app, client.cookie, "post", "/api/auth/organization/create", {
        name: "Pirate",
        slug: `pirate-${randomUUID()}`,
      });
      expect(res.status).toBe(403);
    }
    expect(await totals()).toEqual(before);
  });
});
