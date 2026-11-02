import { memberInviteOutputSchema, memberListOutputSchema } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import {
  call,
  count,
  insertActor,
  insertOrganization,
  roleInDatabase,
  startQueueBoss,
} from "./helpers/organizations.ts";

/** TK-23 C5 : raisons de conflit, NOT_FOUND, owner non attribuable, H3, isolation inter-organisations. */
let database: TestDatabase;
let app: INestApplication;
let boss: PgBoss;
let counter = 0;
const slug = (prefix: string) => `${prefix}-${++counter}`;

beforeAll(async () => {
  database = await createSeededDatabase();
  boss = await startQueueBoss(database);
  app = await createApp({ databaseUrl: database.url });
});

afterAll(async () => {
  await app?.close();
  await boss?.stop();
  await database?.dispose();
});

async function newOrg(prefix = "org") {
  return insertOrganization(database, slug(prefix));
}

const invite = (cookie: string, email: string, role = "dev") =>
  call(app, cookie, "post", "/members/invitations", { email, role });
const setRole = (cookie: string, memberId: string, role: string) =>
  call(app, cookie, "patch", `/members/${memberId}/role`, { memberId, role });

describe("organization.create : slug (C5)", () => {
  it("slug_taken : un slug explicite déjà pris donne 409 et ne crée rien", async () => {
    const owner = await insertActor(database, await newOrg(), "owner");
    await insertOrganization(database, "acme-pris");
    const before = await count(database, "organizations");
    const response = await call(app, owner.cookie, "post", "/organizations", {
      name: "Acme",
      slug: "acme-pris",
    });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("CONFLICT");
    expect(response.body.data.reason).toBe("slug_taken");
    expect(await count(database, "organizations")).toBe(before);
  });

  it("slug absent : dérivé du nom, avec suffixe en cas de collision", async () => {
    const owner = await insertActor(database, await newOrg(), "owner");
    const first = await call(app, owner.cookie, "post", "/organizations", { name: "Mon Équipe" });
    const second = await call(app, owner.cookie, "post", "/organizations", { name: "Mon Équipe" });
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(first.body.slug).toMatch(/^[a-z0-9-]+$/);
    expect(first.body.slug).toContain("mon-equipe");
    expect(second.body.slug).not.toBe(first.body.slug);
  });
});

describe("member.invite (C5, C6)", () => {
  it("crée une invitation pending valide le contrat, dans l'organisation de la session", async () => {
    const orgId = await newOrg();
    const owner = await insertActor(database, orgId, "owner");
    const response = await invite(owner.cookie, "nouveau@example.test", "designer");
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(memberInviteOutputSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toMatchObject({
      email: "nouveau@example.test",
      role: "designer",
      status: "pending",
    });
    const rows = await database.query<{
      organization_id: string;
      inviter_id: string;
      status: string;
      role: string;
      expires_at: Date;
    }>("SELECT * FROM invitations WHERE id = $1", [response.body.id]);
    expect(rows[0]).toMatchObject({
      organization_id: orgId,
      inviter_id: owner.userId,
      status: "pending",
      role: "designer",
    });
    expect(rows[0]?.expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  it("already_member : l'email d'un membre de l'organisation donne 409 sans invitation", async () => {
    const orgId = await newOrg();
    const owner = await insertActor(database, orgId, "owner");
    const dev = await insertActor(database, orgId, "dev");
    const response = await invite(owner.cookie, dev.email);
    expect(response.status).toBe(409);
    expect(response.body.data.reason).toBe("already_member");
    expect(await count(database, "invitations", "organization_id = $1", [orgId])).toBe(0);
  });

  it("already_invited : une invitation pending non expirée donne 409, un seul enregistrement", async () => {
    const orgId = await newOrg();
    const owner = await insertActor(database, orgId, "owner");
    expect((await invite(owner.cookie, "deja@example.test")).status).toBe(200);
    const again = await invite(owner.cookie, "deja@example.test", "client");
    expect(again.status).toBe(409);
    expect(again.body.data.reason).toBe("already_invited");
    expect(await count(database, "invitations", "organization_id = $1", [orgId])).toBe(1);
  });

  it("une invitation expirée n'empêche pas d'inviter à nouveau", async () => {
    const orgId = await newOrg();
    const owner = await insertActor(database, orgId, "owner");
    await database.query(
      `INSERT INTO invitations (id, organization_id, email, role, status, expires_at, inviter_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'ancien@example.test', 'dev', 'pending', now() - interval '1 day', $2, now(), now())`,
      [orgId, owner.userId],
    );
    expect((await invite(owner.cookie, "ancien@example.test")).status).toBe(200);
  });
});

describe("member.invite : owner, H3 et session (C5)", () => {
  it("owner non attribuable : role owner refusé (400), aucune invitation", async () => {
    const orgId = await newOrg();
    const owner = await insertActor(database, orgId, "owner");
    const response = await call(app, owner.cookie, "post", "/members/invitations", {
      email: "chef@example.test",
      role: "owner",
    });
    expect(response.status).toBe(400);
    expect(await count(database, "invitations", "organization_id = $1", [orgId])).toBe(0);
  });

  it("H3 : un admin ne peut pas nommer un admin (403), un owner le peut", async () => {
    const orgId = await newOrg();
    const owner = await insertActor(database, orgId, "owner");
    const admin = await insertActor(database, orgId, "admin");
    const denied = await invite(admin.cookie, "a1@example.test", "admin");
    expect(denied.status).toBe(403);
    expect(await count(database, "invitations", "email = 'a1@example.test'")).toBe(0);
    expect((await invite(owner.cookie, "a2@example.test", "admin")).status).toBe(200);
    expect((await invite(admin.cookie, "a3@example.test", "dev")).status).toBe(200);
  });

  it("l'organisation de l'invitation vient de la session, pas de l'entrée", async () => {
    const orgId = await newOrg();
    const other = await newOrg();
    const owner = await insertActor(database, orgId, "owner");
    const response = await call(app, owner.cookie, "post", "/members/invitations", {
      email: "infiltre@example.test",
      role: "dev",
      organizationId: other,
    });
    expect(response.status).toBe(200);
    expect(await count(database, "invitations", "organization_id = $1", [other])).toBe(0);
  });
});

describe("member.list (C1)", () => {
  it("renvoie les membres de l'organisation avec leur rôle, sans ceux des autres", async () => {
    const orgId = await newOrg();
    const other = await newOrg();
    const owner = await insertActor(database, orgId, "owner");
    const client = await insertActor(database, orgId, "client");
    const reader = await insertActor(database, orgId, "business");
    const stranger = await insertActor(database, other, "dev");
    const response = await call(app, reader.cookie, "get", "/members");
    expect(response.status).toBe(200);
    expect(memberListOutputSchema.safeParse(response.body).success).toBe(true);
    const byId = Object.fromEntries(
      response.body.map((m: { id: string; role: string }) => [m.id, m.role]),
    );
    expect(byId).toEqual({
      [owner.memberId]: "owner",
      [client.memberId]: "client",
      [reader.memberId]: "business",
    });
    expect(byId[stranger.memberId]).toBeUndefined();
  });
});

describe("member.setRole (C5)", () => {
  it("change le rôle d'un membre de l'organisation et le persiste", async () => {
    const orgId = await newOrg();
    const admin = await insertActor(database, orgId, "admin");
    const dev = await insertActor(database, orgId, "dev");
    const response = await setRole(admin.cookie, dev.memberId, "designer");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: dev.memberId, role: "designer" });
    expect(await roleInDatabase(database, dev.memberId)).toBe("designer");
  });

  it("NOT_FOUND : memberId inconnu ou d'une autre organisation, réponses indiscernables", async () => {
    const orgId = await newOrg();
    const other = await newOrg();
    const owner = await insertActor(database, orgId, "owner");
    const stranger = await insertActor(database, other, "dev");
    const unknown = await setRole(owner.cookie, "01900000-0000-7000-8000-0000000000aa", "client");
    const foreign = await setRole(owner.cookie, stranger.memberId, "client");
    expect(unknown.status).toBe(404);
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe("NOT_FOUND");
    expect(JSON.stringify(foreign.body)).not.toContain(stranger.memberId);
    expect(foreign.body).toEqual(unknown.body);
    expect(await roleInDatabase(database, stranger.memberId)).toBe("dev");
  });

  it("owner non attribuable : role owner refusé (400), rôle inchangé", async () => {
    const orgId = await newOrg();
    const owner = await insertActor(database, orgId, "owner");
    const dev = await insertActor(database, orgId, "dev");
    const response = await call(app, owner.cookie, "patch", `/members/${dev.memberId}/role`, {
      memberId: dev.memberId,
      role: "owner",
    });
    expect(response.status).toBe(400);
    expect(await roleInDatabase(database, dev.memberId)).toBe("dev");
  });
});

describe("member.setRole : last_owner et H3 (C5)", () => {
  it("last_owner : l'unique owner ne peut pas se rétrograder (409), rôle inchangé", async () => {
    const orgId = await newOrg();
    const owner = await insertActor(database, orgId, "owner");
    const response = await setRole(owner.cookie, owner.memberId, "admin");
    expect(response.status).toBe(409);
    expect(response.body.data.reason).toBe("last_owner");
    expect(await roleInDatabase(database, owner.memberId)).toBe("owner");
  });

  it("avec deux owners, l'un peut rétrograder l'autre (H3)", async () => {
    const orgId = await newOrg();
    const first = await insertActor(database, orgId, "owner");
    const second = await insertActor(database, orgId, "owner", "owner");
    expect((await setRole(first.cookie, second.memberId, "admin")).status).toBe(200);
    expect(await roleInDatabase(database, second.memberId)).toBe("admin");
  });

  it("H3 : un admin ne modifie pas un owner et ne nomme pas d'admin (403), rôles inchangés", async () => {
    const orgId = await newOrg();
    const owner = await insertActor(database, orgId, "owner");
    const admin = await insertActor(database, orgId, "admin");
    const dev = await insertActor(database, orgId, "dev");
    expect((await setRole(admin.cookie, owner.memberId, "dev")).status).toBe(403);
    expect((await setRole(admin.cookie, dev.memberId, "admin")).status).toBe(403);
    expect(await roleInDatabase(database, owner.memberId)).toBe("owner");
    expect(await roleInDatabase(database, dev.memberId)).toBe("dev");
    expect((await setRole(owner.cookie, dev.memberId, "admin")).status).toBe(200);
  });
});

describe("project.create (C2, C5)", () => {
  it("rejette un nom vide (400) sans rien créer", async () => {
    const owner = await insertActor(database, await newOrg(), "owner");
    const before = await count(database, "projects");
    expect((await call(app, owner.cookie, "post", "/projects", { name: "" })).status).toBe(400);
    expect(await count(database, "projects")).toBe(before);
  });

  it("isolation : le projet n'est visible que dans son organisation (project.list)", async () => {
    const a = await insertActor(database, await newOrg("a"), "owner");
    const b = await insertActor(database, await newOrg("b"), "owner");
    const created = await call(app, a.cookie, "post", "/projects", { name: "Projet A" });
    expect(created.status).toBe(200);
    const listA = await call(app, a.cookie, "get", "/projects");
    const listB = await call(app, b.cookie, "get", "/projects");
    expect(listA.body).toEqual([{ id: created.body.id, name: "Projet A" }]);
    expect(listB.body).toEqual([]);
  });
});
