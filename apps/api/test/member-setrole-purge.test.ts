import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { type ClientScene, createClientScene, linkClient } from "./helpers/client-scene.ts";
import { insertActor, roleInDatabase } from "./helpers/organizations.ts";
import { auditOf, linkCountOfUser } from "./helpers/project-client.ts";
import { installAuditFailTrigger } from "./helpers/repos.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-55a : `member.setRole` purge les liens client <-> projet quand le membre QUITTE le rôle
 * `client`, dans la même transaction. Sinon un retour ultérieur au rôle client ressusciterait des
 * accès d'un autre âge. Aucune entrée d'audit supplémentaire : `member.setRole` porte le fait.
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

const setRole = (memberId: string, role: string, actor = scene.staff.owner) =>
  send(app, actor.cookie, "patch", `/members/${memberId}/role`, { memberId, role });

async function linkedClient(label: string, projects = [scene.projects.p1, scene.projects.p2]) {
  const actor = await insertActor(database, scene.organizationId, "client", label);
  for (const projectId of projects) {
    await linkClient(database, scene.organizationId, projectId, actor.userId);
  }
  return actor;
}

describe("sortie du rôle client : les liens sont supprimés", () => {
  it.each(["dev", "designer", "business", "admin"])(
    "client -> %s : tous les liens du membre disparaissent",
    async (role) => {
      const actor = await linkedClient(`purge-${role}`);
      expect(await linkCountOfUser(database, actor.userId)).toBe(2);
      const res = await setRole(actor.memberId, role);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(await roleInDatabase(database, actor.memberId)).toBe(role);
      expect(await linkCountOfUser(database, actor.userId)).toBe(0);
    },
  );

  it("un retour ultérieur au rôle client ne ressuscite aucun accès", async () => {
    const actor = await linkedClient("purge-return");
    await setRole(actor.memberId, "dev");
    const back = await setRole(actor.memberId, "client");
    expect(back.status).toBe(200);
    expect((await send(app, actor.cookie, "get", "/projects")).body).toEqual([]);
    expect((await send(app, actor.cookie, "get", "/tickets")).status).toBe(404);
  });

  it("les liens des autres clients et ceux du même utilisateur dans une autre organisation survivent", async () => {
    const actor = await linkedClient("purge-scoped", [scene.projects.p1]);
    await database.query(
      `INSERT INTO members (id, organization_id, user_id, role, created_at, updated_at)
       VALUES ($1, $2, $3, 'client', now(), now())`,
      [randomUUID(), scene.foreign.organizationId, actor.userId],
    );
    await linkClient(database, scene.foreign.organizationId, scene.foreign.projectId, actor.userId);
    await setRole(actor.memberId, "dev");
    const remaining = await database.query<{ organization_id: string }>(
      "SELECT organization_id FROM project_client_access WHERE user_id = $1",
      [actor.userId],
    );
    expect(remaining).toEqual([{ organization_id: scene.foreign.organizationId }]);
    expect(await linkCountOfUser(database, scene.c1.userId)).toBe(1);
    expect(await linkCountOfUser(database, scene.c2.userId)).toBe(1);
  });

  it("l'audit ne gagne que l'entrée member.setRole habituelle (aucune entrée de purge)", async () => {
    const actor = await linkedClient("purge-audit");
    const before = await database.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_log WHERE organization_id = $1",
      [scene.organizationId],
    );
    await setRole(actor.memberId, "designer");
    const after = await database.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_log WHERE organization_id = $1",
      [scene.organizationId],
    );
    expect((after[0]?.n ?? 0) - (before[0]?.n ?? 0)).toBe(1);
    const entries = await auditOf(database, scene.organizationId, ["member.setRole"]);
    expect(entries.at(-1)).toMatchObject({ target_kind: "member", target_id: actor.memberId });
    expect(await auditOf(database, scene.organizationId, ["project_client.remove"])).toEqual([]);
  });
});

describe("pas de purge hors sortie du rôle client", () => {
  it("client -> client (sans changement) : les liens sont conservés", async () => {
    const actor = await linkedClient("keep-same");
    const res = await setRole(actor.memberId, "client");
    expect(res.status).toBe(200);
    expect(await linkCountOfUser(database, actor.userId)).toBe(2);
  });

  it("dev -> designer : sans effet sur les liens des autres membres", async () => {
    const dev = await insertActor(database, scene.organizationId, "dev", "keep-dev");
    await setRole(dev.memberId, "designer");
    expect(await linkCountOfUser(database, scene.c1.userId)).toBe(1);
  });

  it("dev -> client : le membre devient client SANS lien (aucun accès avant liaison explicite)", async () => {
    const dev = await insertActor(database, scene.organizationId, "dev", "to-client");
    await setRole(dev.memberId, "client");
    expect(await linkCountOfUser(database, dev.userId)).toBe(0);
    expect((await send(app, dev.cookie, "get", "/projects")).body).toEqual([]);
  });
});

describe("atomicité et refus", () => {
  it("si l'audit member.setRole échoue : rôle inchangé ET liens conservés", async () => {
    const actor = await linkedClient("purge-atomic");
    await database.query("INSERT INTO audit_fail (action) VALUES ('member.setRole')");
    try {
      const res = await setRole(actor.memberId, "dev");
      expect(res.status).toBe(500);
    } finally {
      await database.query("DELETE FROM audit_fail");
    }
    expect(await roleInDatabase(database, actor.memberId)).toBe("client");
    expect(await linkCountOfUser(database, actor.userId)).toBe(2);
  });

  it("changement refusé (rôle de l'appelant insuffisant, 403) : liens conservés", async () => {
    const actor = await linkedClient("purge-denied");
    const res = await setRole(actor.memberId, "dev", scene.staff.dev);
    expect(res.status).toBe(403);
    expect(await roleInDatabase(database, actor.memberId)).toBe("client");
    expect(await linkCountOfUser(database, actor.userId)).toBe(2);
  });

  it("membre d'une autre organisation : 404, liens de l'organisation étrangère conservés", async () => {
    const res = await setRole(scene.foreign.client.memberId, "dev");
    expect(res.status).toBe(404);
    expect(await linkCountOfUser(database, scene.foreign.client.userId)).toBe(1);
  });
});
