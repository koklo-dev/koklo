import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { type ClientScene, createClientScene, linkClient } from "./helpers/client-scene.ts";
import { insertActor, insertOrganization, roleInDatabase } from "./helpers/organizations.ts";
import { auditOf, linkCountOfUser } from "./helpers/project-client.ts";
import { installAuditFailTrigger } from "./helpers/repos.ts";
import { insertMember, insertUser } from "./helpers/session.ts";
import { settingsApi } from "./helpers/settings.ts";

/**
 * TK-97 (cas 6, 7, 8) : `member.page` (pages numérotées, `q`, total réel, 403 client), `member.updateRole`
 * (jamais sur soi, H3, purge des liens en quittant client) et `member.remove` (soi refusé, liens et
 * sessions retirés, audit dans la même transaction).
 */
let database: TestDatabase;
let app: INestApplication;
let scene: ClientScene;

beforeAll(async () => {
  database = await createSeededDatabase();
  await installAuditFailTrigger(database);
  app = await createApp({ databaseUrl: database.url });
  scene = await createClientScene(database);
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const owner = () => settingsApi(app, scene.staff.owner);
const memberCount = async (id: string) =>
  (await database.query("SELECT 1 FROM members WHERE id = $1", [id])).length;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("member.page", () => {
  let organizationId: string;
  let chief: Awaited<ReturnType<typeof insertActor>>;

  beforeAll(async () => {
    organizationId = await insertOrganization(database, `page-${Date.now()}`);
    chief = await insertActor(database, organizationId, "owner", "chef");
    for (let i = 0; i < 29; i++)
      await insertActor(database, organizationId, "dev", `dev${String(i).padStart(2, "0")}`);
  });

  it("pages numérotées : 25 puis 5, total réel de 30, totalIsEstimate faux, ordre stable sans doublon", async () => {
    const first = await settingsApi(app, chief).page("page=1&size=25");
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.items).toHaveLength(25);
    expect(first.body).toMatchObject({ total: 30, totalIsEstimate: false });
    const second = await settingsApi(app, chief).page("page=2&size=25");
    expect(second.body.items).toHaveLength(5);
    const ids = [...first.body.items, ...second.body.items].map((item: { id: string }) => item.id);
    expect(new Set(ids).size).toBe(30);
    const all = await settingsApi(app, chief).page("page=1&size=100");
    expect(all.body.items).toHaveLength(30);
    expect((await settingsApi(app, chief).page("page=9&size=25")).body.items).toEqual([]);
  });

  it("q filtre sur le nom et l'e-mail (insensible à la casse) ; le total suit le filtre", async () => {
    const res = await settingsApi(app, chief).page("page=1&size=25&q=DEV1");
    expect(res.body.total).toBe(10);
    expect(res.body.items.every((item: { email: string }) => item.email.includes("dev1"))).toBe(
      true,
    );
  });

  it("tailles autorisées 25, 50, 100 ; 30 ou page 0 : 422", async () => {
    for (const size of [25, 50, 100]) {
      expect((await settingsApi(app, chief).page(`page=1&size=${size}`)).status).toBe(200);
    }
    expect((await settingsApi(app, chief).page("page=1&size=30")).status).toBe(422);
    expect((await settingsApi(app, chief).page("page=0&size=25")).status).toBe(422);
  });

  it("lastActiveAt : session la plus récente, null sans session ; forme d'une ligne", async () => {
    const userId = randomUUID();
    await insertUser(database, userId, `jamais-${userId.slice(0, 8)}@example.test`);
    await insertMember(database, organizationId, userId, "designer");
    const res = await settingsApi(app, chief).page("page=1&size=100");
    const never = res.body.items.find((item: { userId: string }) => item.userId === userId);
    expect(never).toMatchObject({ role: "designer", projects: [], lastActiveAt: null });
    const active = res.body.items.find((item: { userId: string }) => item.userId === chief.userId);
    expect(active.lastActiveAt).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    expect(active).toMatchObject({ name: chief.name, email: chief.email, role: "owner" });
  });

  it("projets : ceux du client lié, de son organisation seulement", async () => {
    const res = await owner().page("page=1&size=100");
    const c1 = res.body.items.find((item: { userId: string }) => item.userId === scene.c1.userId);
    expect(c1.projects).toEqual([{ id: scene.projects.p1, name: "Projet client 1" }]);
    const c3 = res.body.items.find((item: { userId: string }) => item.userId === scene.c3.userId);
    expect(c3.projects).toEqual([]);
    expect(res.body.total).toBe(8);
  });

  it("owner, admin, dev, designer, business : 200 ; client (lié ou non) : 403", async () => {
    for (const role of ["owner", "admin", "dev", "designer", "business"] as const) {
      expect((await settingsApi(app, scene.staff[role]).page()).status, role).toBe(200);
    }
    expect((await settingsApi(app, scene.c1).page()).status).toBe(403);
    expect((await settingsApi(app, scene.c3).page()).status).toBe(403);
    expect((await settingsApi(app, undefined).page()).status).toBe(401);
  });

  it("ne rend jamais un membre d'une autre organisation", async () => {
    const res = await settingsApi(app, scene.foreign.owner).page("page=1&size=100");
    const ids = res.body.items.map((item: { userId: string }) => item.userId);
    expect(ids).toContain(scene.foreign.client.userId);
    expect(ids).not.toContain(scene.c1.userId);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("member.updateRole", () => {
  it("l'owner change un rôle : 200, une entrée d'audit member.setRole", async () => {
    const dev = await insertActor(database, scene.organizationId, "dev", "role-a");
    const before = (await auditOf(database, scene.organizationId, ["member.setRole"])).length;
    const res = await owner().updateRole(dev.memberId, "designer");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ id: dev.memberId, role: "designer" });
    expect(await roleInDatabase(database, dev.memberId)).toBe("designer");
    expect(
      (await auditOf(database, scene.organizationId, ["member.setRole"])).length - before,
    ).toBe(1);
  });

  it("jamais sur soi : 409 self_role, rôle inchangé, aucun audit", async () => {
    const before = (await auditOf(database, scene.organizationId, ["member.setRole"])).length;
    for (const actor of [scene.staff.owner, scene.staff.admin]) {
      const res = await settingsApi(app, actor).updateRole(actor.memberId, "dev");
      expect(res.status).toBe(409);
      expect(res.body.data).toEqual({ reason: "self_role" });
      expect(await roleInDatabase(database, actor.memberId)).toBe(actor.role);
    }
    expect((await auditOf(database, scene.organizationId, ["member.setRole"])).length).toBe(before);
  });

  it("H3 : un admin ne nomme pas d'admin ni ne touche un owner", async () => {
    const dev = await insertActor(database, scene.organizationId, "dev", "h3");
    const admin = settingsApi(app, scene.staff.admin);
    expect((await admin.updateRole(dev.memberId, "admin")).status).toBe(403);
    expect((await admin.updateRole(scene.staff.owner.memberId, "dev")).status).toBe(403);
    expect(await roleInDatabase(database, scene.staff.owner.memberId)).toBe("owner");
  });

  it("un owner peut rétrograder un autre owner tant qu'il en reste un", async () => {
    const second = await insertActor(database, scene.organizationId, "owner", "second-owner");
    const res = await owner().updateRole(second.memberId, "admin");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("dev, designer, business, client : 403 ; membre d'une autre organisation : 404", async () => {
    const dev = await insertActor(database, scene.organizationId, "dev", "role-b");
    for (const role of ["dev", "designer", "business"] as const) {
      expect(
        (await settingsApi(app, scene.staff[role]).updateRole(dev.memberId, "client")).status,
      ).toBe(403);
    }
    expect((await settingsApi(app, scene.c1).updateRole(dev.memberId, "client")).status).toBe(403);
    expect((await owner().updateRole(scene.foreign.client.memberId, "dev")).status).toBe(404);
  });

  it("quitter le rôle client purge les liens de projet dans la même transaction", async () => {
    const client = await insertActor(database, scene.organizationId, "client", "purge97");
    await linkClient(database, scene.organizationId, scene.projects.p1, client.userId);
    expect(await linkCountOfUser(database, client.userId)).toBe(1);
    expect((await owner().updateRole(client.memberId, "dev")).status).toBe(200);
    expect(await linkCountOfUser(database, client.userId)).toBe(0);
  });

  it("rôle owner ou inconnu : 422", async () => {
    const dev = await insertActor(database, scene.organizationId, "dev", "role-c");
    expect((await owner().updateRole(dev.memberId, "owner")).status).toBe(422);
    expect((await owner().updateRole(dev.memberId, "roi")).status).toBe(422);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("member.remove", () => {
  it("retire le membre, ses liens de projet et ses sessions de l'organisation ; une entrée d'audit member.remove", async () => {
    const client = await insertActor(database, scene.organizationId, "client", "remove97");
    await linkClient(database, scene.organizationId, scene.projects.p1, client.userId);
    const before = (await auditOf(database, scene.organizationId, ["member.remove"])).length;
    const res = await owner().remove(client.memberId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ id: client.memberId });
    expect(await memberCount(client.memberId)).toBe(0);
    expect(await linkCountOfUser(database, client.userId)).toBe(0);
    expect(
      await database.query(
        "SELECT 1 FROM sessions WHERE user_id = $1 AND active_organization_id = $2",
        [client.userId, scene.organizationId],
      ),
    ).toHaveLength(0);
    const entries = await auditOf(database, scene.organizationId, ["member.remove"]);
    expect(entries.length - before).toBe(1);
    expect(entries.at(-1)).toMatchObject({ target_kind: "member", target_id: client.memberId });
    expect((await settingsApi(app, client).me()).status).toBe(401);
  });

  it("garde le compte et ses autres organisations", async () => {
    const dev = await insertActor(database, scene.organizationId, "dev", "multi-org");
    await database.query(
      `INSERT INTO members (id, organization_id, user_id, role, created_at, updated_at) VALUES ($1, $2, $3, 'dev', now(), now())`,
      [randomUUID(), scene.foreign.organizationId, dev.userId],
    );
    expect((await owner().remove(dev.memberId)).status).toBe(200);
    expect(await database.query("SELECT 1 FROM users WHERE id = $1", [dev.userId])).toHaveLength(1);
    expect(
      await database.query("SELECT 1 FROM members WHERE user_id = $1 AND organization_id = $2", [
        dev.userId,
        scene.foreign.organizationId,
      ]),
    ).toHaveLength(1);
  });

  it("soi-même : 409 self_remove (y compris l'unique owner), rien n'est retiré", async () => {
    const res = await owner().remove(scene.staff.owner.memberId);
    expect(res.status).toBe(409);
    expect(res.body.data).toEqual({ reason: "self_remove" });
    expect(await memberCount(scene.staff.owner.memberId)).toBe(1);
    const admin = await settingsApi(app, scene.staff.admin).remove(scene.staff.admin.memberId);
    expect(admin.status).toBe(409);
  });

  it("H3 : un admin ne retire pas un owner ; l'owner garde au moins un owner", async () => {
    expect(
      (await settingsApi(app, scene.staff.admin).remove(scene.staff.owner.memberId)).status,
    ).toBe(403);
    expect(
      await database.query("SELECT 1 FROM members WHERE organization_id = $1 AND role = 'owner'", [
        scene.organizationId,
      ]),
    ).not.toHaveLength(0);
  });

  it("dev, designer, business, client : 403 ; autre organisation : 404", async () => {
    const dev = await insertActor(database, scene.organizationId, "dev", "rm-b");
    for (const role of ["dev", "designer", "business"] as const) {
      expect((await settingsApi(app, scene.staff[role]).remove(dev.memberId)).status).toBe(403);
    }
    expect((await settingsApi(app, scene.c1).remove(dev.memberId)).status).toBe(403);
    expect((await owner().remove(scene.foreign.client.memberId)).status).toBe(404);
    expect(await memberCount(dev.memberId)).toBe(1);
  });

  it("atomicité : si l'audit member.remove échoue, le membre et ses liens restent", async () => {
    const client = await insertActor(database, scene.organizationId, "client", "rm-atomic");
    await linkClient(database, scene.organizationId, scene.projects.p2, client.userId);
    await database.query("INSERT INTO audit_fail (action) VALUES ('member.remove')");
    try {
      expect((await owner().remove(client.memberId)).status).toBe(500);
    } finally {
      await database.query("DELETE FROM audit_fail");
    }
    expect(await memberCount(client.memberId)).toBe(1);
    expect(await linkCountOfUser(database, client.userId)).toBe(1);
  });
});
