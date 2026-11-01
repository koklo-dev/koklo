import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { type ClientScene, createClientScene, STAFF } from "./helpers/client-scene.ts";
import { insertActor, insertOrganization } from "./helpers/organizations.ts";
import { insertMember } from "./helpers/session.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-55 B1-bis : Better Auth monte ses propres routes `/api/auth/organization/*` (plugin
 * `organization`) SANS le garde de rôle de l'api. Avec le cookie d'un client, `list-members` et
 * `get-full-organization` rendaient e-mails, identifiants et rôles de tous les membres. Ce canal
 * est fermé au client (lecture d'autrui) et à toute écriture d'organisation, fail-closed.
 */
let database: TestDatabase;
let app: INestApplication;
let scene: ClientScene;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  scene = await createClientScene(database);
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const READ_OTHERS = [
  "/api/auth/organization/list-members",
  "/api/auth/organization/get-full-organization",
  "/api/auth/organization/list-invitations",
  "/api/auth/organization/get-organization",
] as const;

const WRITES = [
  "/api/auth/organization/create",
  "/api/auth/organization/update",
  "/api/auth/organization/delete",
  "/api/auth/organization/check-slug",
  "/api/auth/organization/invite-member",
  "/api/auth/organization/cancel-invitation",
  "/api/auth/organization/remove-member",
  "/api/auth/organization/update-member-role",
  "/api/auth/organization/leave",
] as const;

/** Un acteur au rôle donné dans une organisation neuve (rôle hors liste : inconnu, casse, multiple). */
async function actorWithRole(role: string) {
  const org = await insertOrganization(database, `b1bis-${randomUUID()}`);
  const actor = await insertActor(database, org, "dev", "role-variant");
  await database.query("UPDATE members SET role = $2 WHERE id = $1", [actor.memberId, role]);
  return actor;
}

const memberRoles = async () =>
  database.query<{ id: string; role: string }>(
    "SELECT id, role FROM members WHERE organization_id = $1 ORDER BY id",
    [scene.organizationId],
  );

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même canal, un test par comportement
describe("lecture d'autrui via Better Auth : fermée au client", () => {
  it.each(READ_OTHERS)("%s : client lié et non lié refusés (403), sans fuite", async (path) => {
    for (const client of [scene.c1, scene.c3]) {
      const res = await send(app, client.cookie, "get", path);
      expect(res.status, path).toBe(403);
      expect(res.text).not.toContain("@");
      expect(res.text).not.toContain(scene.staff.owner.userId);
    }
  });

  it.each(["member", "Client", "OWNER", "client,owner", "owner,client", " owner", ""])(
    "rôle %j (inconnu, casse, multiple, vide) : refusé, fail-closed",
    async (role) => {
      const actor = await actorWithRole(role);
      for (const path of READ_OTHERS) {
        const res = await send(app, actor.cookie, "get", path);
        expect(res.status, `${path} ${role}`).toBe(403);
        expect(res.text).not.toContain("@");
      }
    },
  );

  it("refus uniforme : même statut et même corps pour toutes les routes et tous les motifs", async () => {
    const unknown = await actorWithRole("member");
    const bodies = new Set<string>();
    for (const path of READ_OTHERS) {
      for (const actor of [scene.c1, scene.c3, unknown]) {
        const res = await send(app, actor.cookie, "get", path);
        bodies.add(`${res.status} ${res.text}`);
      }
    }
    expect(bodies.size).toBe(1);
  });

  it.each(STAFF)("%s : toujours servi", async (role) => {
    for (const path of READ_OTHERS) {
      const res = await send(app, scene.staff[role].cookie, "get", path);
      expect(res.status, `${role} ${path}`).toBe(200);
    }
  });

  it("sans session : 401, aucune donnée", async () => {
    const res = await send(app, undefined, "get", READ_OTHERS[0]);
    expect(res.status).toBe(401);
    expect(res.text).not.toContain("@");
  });

  it.each([
    "/api/auth/Organization/list-members",
    "/api/auth/ORGANIZATION/LIST-MEMBERS",
    "/api/auth/organization/list-members/",
    "/api/auth//organization/list-members",
    "/api/auth/organization//list-members",
    "/api/auth/./organization/list-members",
    "/api/auth/x/../organization/list-members",
    "/api/auth/%2e/organization/list-members",
    "/api/auth/%6frganization/list-members",
    "/api/auth/organization/%6cist-members",
    "/api/auth/organization/list-members%2f",
    "/api/auth/organization%2flist-members",
    "/api/auth/organization/list-members?organizationId=x&organizationSlug=y",
    "/api/auth/organization/list-members;x=1",
  ])("variante de chemin %s : jamais de fuite pour le client", async (path) => {
    const res = await send(app, scene.c3.cookie, "get", path);
    expect(res.text).not.toContain("@");
    expect(res.text).not.toContain(scene.staff.owner.userId);
  });

  it("chemin inconnu du plugin : refusé au client (deny by default)", async () => {
    const res = await send(app, scene.c3.cookie, "get", "/api/auth/organization/nouvelle-route");
    expect(res.status).toBe(403);
  });

  it("organisation ciblée par la requête : équipe ici, client là-bas, refusé", async () => {
    const other = await insertOrganization(database, `b1bis-other-${randomUUID()}`);
    const owner = await insertActor(database, other, "owner", "other-owner");
    await insertMember(database, other, scene.staff.dev.userId, "client");
    for (const selector of [`organizationId=${other}`, `organizationSlug=${other}`]) {
      const res = await send(
        app,
        scene.staff.dev.cookie,
        "get",
        `/api/auth/organization/list-members?${selector}`,
      );
      expect(res.status, selector).toBe(403);
      expect(res.text).not.toContain(owner.email);
    }
  });
});

describe("écriture d'organisation via Better Auth : impossible, quel que soit le rôle", () => {
  it.each(WRITES)("%s : client refusé (403) et rien ne change", async (path) => {
    const before = await memberRoles();
    for (const client of [scene.c1, scene.c3]) {
      const res = await send(app, client.cookie, "post", path, {
        memberId: client.memberId,
        role: "owner",
        email: "pirate@example.test",
        organizationId: scene.organizationId,
        name: "pirate",
        slug: `pirate-${randomUUID()}`,
        data: { name: "pirate" },
        invitationId: randomUUID(),
      });
      expect(res.status, path).toBe(403);
    }
    expect(await memberRoles()).toEqual(before);
  });

  it("un client ne peut pas s'auto-promouvoir (update-member-role)", async () => {
    const res = await send(
      app,
      scene.c3.cookie,
      "post",
      "/api/auth/organization/update-member-role",
      { memberId: scene.c3.memberId, role: "owner", organizationId: scene.organizationId },
    );
    expect(res.status).toBe(403);
    const [row] = await database.query<{ role: string }>("SELECT role FROM members WHERE id = $1", [
      scene.c3.memberId,
    ]);
    expect(row?.role).toBe("client");
  });

  it.each(["owner", "admin"] as const)(
    "%s : l'écriture passe par oRPC (audit, purge), pas par ce canal",
    async (role) => {
      const before = await memberRoles();
      const res = await send(
        app,
        scene.staff[role].cookie,
        "post",
        "/api/auth/organization/update-member-role",
        { memberId: scene.c3.memberId, role: "dev", organizationId: scene.organizationId },
      );
      expect(res.status).toBe(403);
      expect(await memberRoles()).toEqual(before);
    },
  );

  it("chemin d'écriture inconnu : refusé au client comme au propriétaire", async () => {
    for (const actor of [scene.c3, scene.staff.owner]) {
      const res = await send(app, actor.cookie, "post", "/api/auth/organization/autre", {});
      expect(res.status).toBe(403);
    }
  });
});

describe("lecture de soi et parcours d'invitation : conservés", () => {
  it.each([
    "/api/auth/organization/list",
    "/api/auth/organization/get-active-member",
    "/api/auth/organization/get-active-member-role",
  ])("%s : le client lit uniquement ses propres données", async (path) => {
    const res = await send(app, scene.c3.cookie, "get", path);
    expect(res.status, path).toBe(200);
    expect(res.text).not.toContain(scene.staff.owner.email);
    expect(res.text).not.toContain(scene.c1.email);
  });

  it("set-active : le client active une organisation dont il est membre", async () => {
    const res = await send(app, scene.c3.cookie, "post", "/api/auth/organization/set-active", {
      organizationId: scene.organizationId,
    });
    expect(res.status).toBe(200);
  });

  it("set-active : une organisation étrangère reste refusée par Better Auth", async () => {
    const res = await send(app, scene.c3.cookie, "post", "/api/auth/organization/set-active", {
      organizationId: scene.foreign.organizationId,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("get-invitation / accept-invitation : atteignent Better Auth (invitation inconnue : 4xx métier)", async () => {
    const get = await send(
      app,
      scene.c3.cookie,
      "get",
      `/api/auth/organization/get-invitation?id=${randomUUID()}`,
    );
    expect(get.status).not.toBe(403);
    const accept = await send(
      app,
      scene.c3.cookie,
      "post",
      "/api/auth/organization/accept-invitation",
      { invitationId: randomUUID() },
    );
    expect(accept.status).not.toBe(403);
  });
});
