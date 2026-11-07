import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { type ClientScene, createClientScene } from "./helpers/client-scene.ts";
import { insertActor, SEND_INVITATION_QUEUE, startQueueBoss } from "./helpers/organizations.ts";
import {
  acceptInvitation,
  activeSessionOf,
  auditActions,
  invitationProjectIds,
  invitationRow,
  settingsApi,
} from "./helpers/settings.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-97 (cas 4 et 5) : `invitation.create|list|resend|revoke` et acceptation. Un client invité sur P1
 * seulement voit P1 et reçoit 404 sur P2 ; les liens naissent à l'acceptation, jamais avant.
 */
let database: TestDatabase;
let app: INestApplication;
let boss: PgBoss;
let scene: ClientScene;

beforeAll(async () => {
  database = await createSeededDatabase();
  boss = await startQueueBoss(database);
  app = await createApp({ databaseUrl: database.url });
  scene = await createClientScene(database);
});

afterAll(async () => {
  await app?.close();
  await boss?.stop();
  await database?.dispose();
});

const owner = () => settingsApi(app, scene.staff.owner);
const email = (label: string) => `${label}-${randomUUID().slice(0, 8)}@example.test`;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("invitation.create : projets", () => {
  it("client avec un projet : 200, ligne invitation_projects, aucun lien tant que non acceptée", async () => {
    const res = await owner().invite({
      email: email("c"),
      role: "client",
      projectIds: [scene.projects.p1],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ role: "client", status: "pending" });
    expect(res.body.projects).toEqual([{ id: scene.projects.p1, name: "Projet client 1" }]);
    expect(await invitationProjectIds(database, res.body.id)).toEqual([scene.projects.p1]);
    const links = await database.query(
      "SELECT 1 FROM project_client_access WHERE organization_id = $1 AND created_by_user_id IS NULL AND user_id IN (SELECT id FROM users WHERE email = $2)",
      [scene.organizationId, res.body.email],
    );
    expect(links).toHaveLength(0);
  });

  it("business avec projets : 200 (enregistrés et affichés, B98)", async () => {
    const res = await owner().invite({
      email: email("b"),
      role: "business",
      projectIds: [scene.projects.p1, scene.projects.p2],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await invitationProjectIds(database, res.body.id)).toHaveLength(2);
  });

  it.each(["client", "business"])(
    "%s sans projet : 422 VALIDATION, aucune invitation créée",
    async (role) => {
      const address = email("sans-projet");
      const res = await owner().invite({ email: address, role, projectIds: [] });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("VALIDATION");
      expect((await owner().invite({ email: address, role })).status).toBe(422);
      expect(
        await database.query("SELECT 1 FROM invitations WHERE email = $1", [address]),
      ).toHaveLength(0);
    },
  );

  it.each(["dev", "designer", "admin"])(
    "%s avec des projets : 422 (refusés pour les autres rôles)",
    async (role) => {
      const res = await owner().invite({
        email: email("autre"),
        role,
        projectIds: [scene.projects.p1],
      });
      expect(res.status).toBe(422);
    },
  );

  it("dev, designer sans projet : 200", async () => {
    expect((await owner().invite({ email: email("d"), role: "dev" })).status).toBe(200);
    expect((await owner().invite({ email: email("g"), role: "designer" })).status).toBe(200);
  });

  it("projet d'une autre organisation ou inconnu : 404 uniforme, rien n'est écrit", async () => {
    for (const projectId of [scene.foreign.projectId, randomUUID()]) {
      const address = email("etranger");
      const res = await owner().invite({ email: address, role: "client", projectIds: [projectId] });
      expect(res.status).toBe(404);
      expect(
        await database.query("SELECT 1 FROM invitations WHERE email = $1", [address]),
      ).toHaveLength(0);
    }
  });

  it("déjà membre : 409 already_member ; déjà invité (vivante) : 409 already_invited", async () => {
    const member = await owner().invite({
      email: scene.c3.email,
      role: "client",
      projectIds: [scene.projects.p1],
    });
    expect(member.status).toBe(409);
    expect(member.body.data).toEqual({ reason: "already_member" });
    const address = email("deux-fois");
    await owner().invite({ email: address, role: "dev" });
    const twice = await owner().invite({ email: address, role: "dev" });
    expect(twice.status).toBe(409);
    expect(twice.body.data).toEqual({ reason: "already_invited" });
  });

  it("enfile exactement un job d'envoi avec le lien d'acceptation", async () => {
    await boss.fetch(SEND_INVITATION_QUEUE, { batchSize: 100 });
    const address = email("job");
    const res = await owner().invite({ email: address, role: "dev" });
    const jobs = await boss.fetch<Record<string, string>>(SEND_INVITATION_QUEUE, { batchSize: 10 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data).toMatchObject({
      email: address,
      url: `http://localhost:3000/accept-invitation/${res.body.id}`,
      role: "dev",
    });
  });

  it("une entrée d'audit member.invite par invitation", async () => {
    const before = (await auditActions(database, scene.organizationId)).filter(
      (a) => a === "member.invite",
    ).length;
    await owner().invite({ email: email("audit"), role: "dev" });
    const after = (await auditActions(database, scene.organizationId)).filter(
      (a) => a === "member.invite",
    ).length;
    expect(after - before).toBe(1);
  });

  it("H3 : un admin ne nomme pas d'admin ; dev, designer, business, client : 403", async () => {
    expect(
      (await settingsApi(app, scene.staff.admin).invite({ email: email("h3"), role: "admin" }))
        .status,
    ).toBe(403);
    for (const role of ["dev", "designer", "business"] as const) {
      expect(
        (await settingsApi(app, scene.staff[role]).invite({ email: email("x"), role: "dev" }))
          .status,
      ).toBe(403);
    }
    expect(
      (await settingsApi(app, scene.c1).invite({ email: email("x"), role: "dev" })).status,
    ).toBe(403);
  });

  it("l'admin invite un client", async () => {
    const res = await settingsApi(app, scene.staff.admin).invite({
      email: email("adm"),
      role: "client",
      projectIds: [scene.projects.p2],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("invitation.list, resend, revoke", () => {
  it("list : seulement les invitations pending vivantes de l'organisation, avec projets et invitant", async () => {
    const live = await owner().invite({
      email: email("vive"),
      role: "client",
      projectIds: [scene.projects.p1],
    });
    const revoked = await owner().invite({ email: email("revoquee"), role: "dev" });
    await owner().revoke(revoked.body.id);
    const expired = await owner().invite({ email: email("expiree"), role: "dev" });
    await database.query(
      "UPDATE invitations SET expires_at = now() - interval '1 day' WHERE id = $1",
      [expired.body.id],
    );
    const res = await owner().invitations();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const ids = res.body.map((item: { id: string }) => item.id);
    expect(ids).toContain(live.body.id);
    expect(ids).not.toContain(revoked.body.id);
    expect(ids).not.toContain(expired.body.id);
    const item = res.body.find((entry: { id: string }) => entry.id === live.body.id);
    expect(item).toMatchObject({
      role: "client",
      invitedBy: scene.staff.owner.name,
      projects: [{ id: scene.projects.p1 }],
    });
    const foreign = await settingsApi(app, scene.foreign.owner).invitations();
    expect(foreign.body.map((entry: { id: string }) => entry.id)).not.toContain(live.body.id);
  });

  it("list : 403 pour dev et client", async () => {
    expect((await settingsApi(app, scene.staff.dev).invitations()).status).toBe(403);
    expect((await settingsApi(app, scene.c1).invitations()).status).toBe(403);
  });

  it("resend : renvoie le job d'envoi avec le même lien et une entrée d'audit invitation.resend", async () => {
    const created = await owner().invite({ email: email("renvoi"), role: "dev" });
    await boss.fetch(SEND_INVITATION_QUEUE, { batchSize: 100 });
    const res = await owner().resend(created.body.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    const jobs = await boss.fetch<Record<string, string>>(SEND_INVITATION_QUEUE, { batchSize: 10 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data.url).toBe(`http://localhost:3000/accept-invitation/${created.body.id}`);
    expect(await auditActions(database, scene.organizationId)).toContain("invitation.resend");
  });

  it("resend : 404 pour une invitation révoquée, expirée, inconnue ou d'une autre organisation ; 403 sans droit", async () => {
    const revoked = await owner().invite({ email: email("r1"), role: "dev" });
    await owner().revoke(revoked.body.id);
    expect((await owner().resend(revoked.body.id)).status).toBe(404);
    expect((await owner().resend(randomUUID())).status).toBe(404);
    const mine = await owner().invite({ email: email("r2"), role: "dev" });
    expect((await settingsApi(app, scene.foreign.owner).resend(mine.body.id)).status).toBe(404);
    expect((await settingsApi(app, scene.staff.dev).resend(mine.body.id)).status).toBe(403);
  });

  it("revoke : passe l'invitation à canceled, 404 la seconde fois, audit invitation.revoke", async () => {
    const created = await owner().invite({ email: email("rev"), role: "dev" });
    const res = await owner().revoke(created.body.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await invitationRow(database, created.body.id))?.status).toBe("canceled");
    expect((await owner().revoke(created.body.id)).status).toBe(404);
    expect(await auditActions(database, scene.organizationId)).toContain("invitation.revoke");
  });

  it("revoke : 404 hors organisation, 403 pour dev et client (l'invitation reste pending)", async () => {
    const created = await owner().invite({ email: email("rev2"), role: "dev" });
    expect((await settingsApi(app, scene.foreign.owner).revoke(created.body.id)).status).toBe(404);
    expect((await settingsApi(app, scene.staff.dev).revoke(created.body.id)).status).toBe(403);
    expect((await settingsApi(app, scene.c1).revoke(created.body.id)).status).toBe(403);
    expect((await invitationRow(database, created.body.id))?.status).toBe("pending");
  });

  it("une invitation révoquée ne s'accepte plus et ne crée aucun lien", async () => {
    const created = await owner().invite({
      email: email("rev3"),
      role: "client",
      projectIds: [scene.projects.p1],
    });
    await owner().revoke(created.body.id);
    const { response, userId } = await acceptInvitation(app, database, created.body);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(
      await database.query("SELECT 1 FROM project_client_access WHERE user_id = $1", [userId]),
    ).toHaveLength(0);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("acceptation : liens client <-> projet et cloisonnement", () => {
  it("client invité sur P1 : après acceptation il voit P1 et reçoit 404 sur P2", async () => {
    const created = await owner().invite({
      email: email("accepte"),
      role: "client",
      projectIds: [scene.projects.p1],
    });
    const { userId, response } = await acceptInvitation(app, database, created.body);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const links = await database.query<{ project_id: string; organization_id: string }>(
      "SELECT project_id, organization_id FROM project_client_access WHERE user_id = $1",
      [userId],
    );
    expect(links).toEqual([
      { project_id: scene.projects.p1, organization_id: scene.organizationId },
    ]);
    const cookie = await activeSessionOf(database, userId, scene.organizationId);
    const list = await send(app, cookie, "get", "/projects");
    expect(list.body.map((project: { id: string }) => project.id)).toEqual([scene.projects.p1]);
    expect((await send(app, cookie, "get", `/projects/${scene.projects.p1}/shell`)).status).toBe(
      200,
    );
    expect((await send(app, cookie, "get", `/projects/${scene.projects.p2}/shell`)).status).toBe(
      404,
    );
    expect((await send(app, cookie, "get", `/projects/${scene.projects.p2}/tickets`)).status).toBe(
      404,
    );
    expect((await send(app, cookie, "get", `/projects/${scene.projects.old}/shell`)).status).toBe(
      404,
    );
  });

  it("deux projets proposés, deux liens ; le rôle devient celui de l'invitation", async () => {
    const created = await owner().invite({
      email: email("deux"),
      role: "client",
      projectIds: [scene.projects.p1, scene.projects.p2],
    });
    const { userId } = await acceptInvitation(app, database, created.body);
    const links = await database.query("SELECT 1 FROM project_client_access WHERE user_id = $1", [
      userId,
    ]);
    expect(links).toHaveLength(2);
    const [member] = await database.query<{ role: string }>(
      "SELECT role FROM members WHERE user_id = $1 AND organization_id = $2",
      [userId, scene.organizationId],
    );
    expect(member?.role).toBe("client");
  });

  it("business : liens créés aussi (B98) ; dev : aucun lien", async () => {
    const business = await owner().invite({
      email: email("biz"),
      role: "business",
      projectIds: [scene.projects.p1],
    });
    const accepted = await acceptInvitation(app, database, business.body);
    expect(
      await database.query("SELECT 1 FROM project_client_access WHERE user_id = $1", [
        accepted.userId,
      ]),
    ).toHaveLength(1);
    const dev = await owner().invite({ email: email("dev"), role: "dev" });
    const other = await acceptInvitation(app, database, dev.body);
    expect(other.response.status).toBe(200);
    expect(
      await database.query("SELECT 1 FROM project_client_access WHERE user_id = $1", [
        other.userId,
      ]),
    ).toHaveLength(0);
  });

  it("échec de création des liens : l'invitation n'est PAS acceptée, aucun membre, aucun accès partiel", async () => {
    const created = await owner().invite({
      email: email("echec"),
      role: "client",
      projectIds: [scene.projects.p1, scene.projects.p2],
    });
    await database.query(
      `CREATE OR REPLACE FUNCTION link_refused() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'lien refusé pour le test'; END $$`,
    );
    await database.query(
      "CREATE TRIGGER link_refused BEFORE INSERT ON project_client_access FOR EACH ROW EXECUTE FUNCTION link_refused()",
    );
    let userId: string;
    try {
      const accepted = await acceptInvitation(app, database, created.body);
      userId = accepted.userId;
      expect(accepted.response.status).toBeGreaterThanOrEqual(400);
    } finally {
      await database.query("DROP TRIGGER link_refused ON project_client_access");
    }
    expect((await invitationRow(database, created.body.id))?.status).toBe("pending");
    expect(await database.query("SELECT 1 FROM members WHERE user_id = $1", [userId])).toHaveLength(
      0,
    );
    expect(
      await database.query("SELECT 1 FROM project_client_access WHERE user_id = $1", [userId]),
    ).toHaveLength(0);
  });
});
