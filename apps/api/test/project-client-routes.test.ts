import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import {
  type ClientScene,
  createClientScene,
  linkClient,
  shapeOf,
} from "./helpers/client-scene.ts";
import { insertActor } from "./helpers/organizations.ts";
import { auditOf, linkRows, projectClientApi } from "./helpers/project-client.ts";
import { installAuditFailTrigger } from "./helpers/repos.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-55a : groupe `projectClient` (contrat 0.10.0) : lier un membre `client` à un projet. Réservé
 * aux gestionnaires (owner, admin, CDC §14 « gérer membres »). Le rôle de la cible est un
 * invariant d'API (la base ne le voit pas). Idempotent, audité sans contenu libre.
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

const api = (actor = scene.staff.owner) => projectClientApi(app, actor);
const freshClient = (label: string) => insertActor(database, scene.organizationId, "client", label);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("matrice des six rôles", () => {
  it.each(["owner", "admin"] as const)(
    "%s : list, add et remove réussissent (200)",
    async (role) => {
      const client = await freshClient(`matrix-${role}`);
      const as = api(scene.staff[role]);
      const added = await as.add(scene.projects.p1, client.memberId);
      expect(added.status, JSON.stringify(added.body)).toBe(200);
      const listed = await as.list(scene.projects.p1);
      expect(listed.status).toBe(200);
      expect(listed.body.map((c: { memberId: string }) => c.memberId)).toContain(client.memberId);
      const removed = await as.remove(scene.projects.p1, client.memberId);
      expect(removed.status).toBe(200);
    },
  );

  it.each(["dev", "designer", "business"] as const)(
    "%s : list, add et remove sont refusés (403 FORBIDDEN), rien n'est écrit",
    async (role) => {
      const client = await freshClient(`denied-${role}`);
      const as = api(scene.staff[role]);
      for (const res of [
        await as.list(scene.projects.p1),
        await as.add(scene.projects.p1, client.memberId),
        await as.remove(scene.projects.p1, client.memberId),
      ]) {
        expect(res.status).toBe(403);
        expect(res.body.code).toBe("FORBIDDEN");
      }
      expect((await linkRows(database, scene.projects.p1)).map((r) => r.user_id)).not.toContain(
        client.userId,
      );
    },
  );

  it("client : 403 sur les trois procédures, même sur son propre projet lié (pas de 404)", async () => {
    const as = api(scene.c1);
    for (const res of [
      await as.list(scene.projects.p1),
      await as.add(scene.projects.p1, scene.c1.memberId),
      await as.remove(scene.projects.p1, scene.c1.memberId),
      await as.list(scene.projects.p2),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    }
  });

  it("sans session : 401 UNAUTHORIZED", async () => {
    const as = projectClientApi(app, undefined);
    for (const res of [
      await as.list(scene.projects.p1),
      await as.add(scene.projects.p1, scene.c1.memberId),
      await as.remove(scene.projects.p1, scene.c1.memberId),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("UNAUTHORIZED");
    }
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("projectClient.add", () => {
  it("lie le client : 200, élément complet, ligne posée avec l'organisation et l'auteur de la session", async () => {
    const client = await freshClient("add-ok");
    const res = await api().add(scene.projects.p2, client.memberId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      memberId: client.memberId,
      userId: client.userId,
      name: client.name,
      email: client.email,
      createdAt: expect.any(String),
    });
    const rows = (await linkRows(database, scene.projects.p2)).filter(
      (r) => r.user_id === client.userId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organization_id: scene.organizationId,
      created_by_user_id: scene.staff.owner.userId,
    });
  });

  it("ouvre l'accès du client à ce projet (liste de projets, tickets) dès l'appel suivant", async () => {
    const client = await freshClient("add-effect");
    expect((await send(app, client.cookie, "get", "/projects")).body).toEqual([]);
    expect((await send(app, client.cookie, "get", "/tickets")).status).toBe(404);
    await api().add(scene.projects.p1, client.memberId);
    const projects = await send(app, client.cookie, "get", "/projects");
    expect(projects.body.map((p: { id: string }) => p.id)).toEqual([scene.projects.p1]);
    expect((await send(app, client.cookie, "get", "/tickets")).status).toBe(200);
  });

  it("idempotent : un second appel renvoie 200 et la même ligne, sans doublon ni nouvel audit", async () => {
    const client = await freshClient("add-idem");
    const first = await api().add(scene.projects.p1, client.memberId);
    const second = await api(scene.staff.admin).add(scene.projects.p1, client.memberId);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    const rows = (await linkRows(database, scene.projects.p1)).filter(
      (r) => r.user_id === client.userId,
    );
    expect(rows).toHaveLength(1);
    // La ligne et son auteur sont ceux du premier appel.
    expect(rows[0]?.created_by_user_id).toBe(scene.staff.owner.userId);
    const audit = (await auditOf(database, scene.organizationId, ["project_client.add"])).filter(
      (a) => a.target_id === rows[0]?.id,
    );
    expect(audit).toHaveLength(1);
  });

  it("un membre qui n'a pas le rôle client est refusé (422 VALIDATION), sans ligne ni audit", async () => {
    const before = await auditOf(database, scene.organizationId, ["project_client.add"]);
    for (const role of ["owner", "admin", "dev", "designer", "business"] as const) {
      const res = await api().add(scene.projects.p1, scene.staff[role].memberId);
      expect(res.status, role).toBe(422);
      expect(res.body.code, role).toBe("VALIDATION");
    }
    const rows = await linkRows(database, scene.projects.p1);
    for (const role of ["owner", "admin", "dev", "designer", "business"] as const) {
      expect(rows.map((r) => r.user_id)).not.toContain(scene.staff[role].userId);
    }
    expect(await auditOf(database, scene.organizationId, ["project_client.add"])).toHaveLength(
      before.length,
    );
  });

  it("membre d'une autre organisation, membre inconnu, identifiant non UUID : 422 sans oracle d'existence", async () => {
    const notClient = await api().add(scene.projects.p1, scene.staff.dev.memberId);
    const foreign = await api().add(scene.projects.p1, scene.foreign.client.memberId);
    const unknown = await api().add(scene.projects.p1, randomUUID());
    const malformed = await api().add(scene.projects.p1, "pas-un-uuid");
    expect(foreign.status).toBe(422);
    expect(unknown.status).toBe(422);
    expect(malformed.status).toBe(422);
    expect(shapeOf(foreign)).toEqual(shapeOf(unknown));
    expect(shapeOf(notClient)).toEqual(shapeOf(unknown));
    expect(await linkRows(database, scene.projects.p1)).not.toContainEqual(
      expect.objectContaining({ user_id: scene.foreign.client.userId }),
    );
  });

  it("projet d'une autre organisation ou inexistant : 404 identiques, avant tout contrôle du membre", async () => {
    const client = await freshClient("add-404");
    const foreign = await api().add(scene.foreign.projectId, client.memberId);
    const unknown = await api().add(randomUUID(), client.memberId);
    const withBadMember = await api().add(scene.foreign.projectId, randomUUID());
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe("NOT_FOUND");
    expect(shapeOf(foreign)).toEqual(shapeOf(unknown));
    expect(shapeOf(withBadMember)).toEqual(shapeOf(unknown));
    expect(await linkRows(database, scene.foreign.projectId)).toHaveLength(1);
  });

  it("owner d'une autre organisation : 404 sur le projet de l'organisation A, aucun lien créé", async () => {
    const client = await freshClient("add-cross-org");
    const res = await api(scene.foreign.owner).add(scene.projects.p1, client.memberId);
    expect(res.status).toBe(404);
    expect((await linkRows(database, scene.projects.p1)).map((r) => r.user_id)).not.toContain(
      client.userId,
    );
  });

  it("organisation, auteur et identifiant de la ligne viennent du serveur, jamais de l'entrée", async () => {
    const client = await freshClient("add-forged");
    const forged = randomUUID();
    const res = await api().add(scene.projects.p1, client.memberId, {
      organizationId: scene.foreign.organizationId,
      userId: scene.staff.dev.userId,
      createdByUserId: scene.staff.dev.userId,
      id: forged,
    });
    expect(res.status).toBe(200);
    const row = (await linkRows(database, scene.projects.p1)).find(
      (r) => r.user_id === client.userId,
    );
    expect(row).toMatchObject({
      organization_id: scene.organizationId,
      created_by_user_id: scene.staff.owner.userId,
    });
    expect(row?.id).not.toBe(forged);
  });

  it("audit : une entrée project_client.add / project_client, cible = ligne, sans contenu libre", async () => {
    const client = await freshClient("add-audit");
    await api().add(scene.projects.p1, client.memberId);
    const row = (await linkRows(database, scene.projects.p1)).find(
      (r) => r.user_id === client.userId,
    );
    const entries = (await auditOf(database, scene.organizationId, ["project_client.add"])).filter(
      (a) => a.target_id === row?.id,
    );
    expect(entries).toEqual([
      {
        action: "project_client.add",
        target_kind: "project_client",
        target_id: row?.id,
        actor_id: scene.staff.owner.userId,
        ticket_id: null,
      },
    ]);
  });

  it("atomique : si l'audit échoue, le lien n'est pas créé (500 INTERNAL)", async () => {
    const client = await freshClient("add-atomic");
    await database.query("INSERT INTO audit_fail (action) VALUES ('project_client.add')");
    try {
      const res = await api().add(scene.projects.p1, client.memberId);
      expect(res.status).toBe(500);
      expect(res.body.code).toBe("INTERNAL");
    } finally {
      await database.query("DELETE FROM audit_fail");
    }
    expect((await linkRows(database, scene.projects.p1)).map((r) => r.user_id)).not.toContain(
      client.userId,
    );
  });
});

describe("projectClient.list", () => {
  it("ne liste que les clients liés au projet demandé, avec nom et email, jamais d'autres champs", async () => {
    const res = await api().list(scene.projects.p1);
    expect(res.status).toBe(200);
    const ids = res.body.map((c: { memberId: string }) => c.memberId);
    expect(ids).toContain(scene.c1.memberId);
    expect(ids).not.toContain(scene.c2.memberId);
    expect(ids).not.toContain(scene.c3.memberId);
    for (const item of res.body) {
      expect(Object.keys(item).sort()).toEqual([
        "createdAt",
        "email",
        "memberId",
        "name",
        "userId",
      ]);
    }
  });

  it("projet sans client : 200 et []", async () => {
    expect((await api().list(scene.projects.old)).body).toEqual([]);
  });

  it("projet d'une autre organisation ou inexistant : 404 identiques", async () => {
    const foreign = await api().list(scene.foreign.projectId);
    const unknown = await api().list(randomUUID());
    expect(foreign.status).toBe(404);
    expect(shapeOf(foreign)).toEqual(shapeOf(unknown));
    expect(JSON.stringify(foreign.body)).not.toContain(scene.foreign.client.email);
  });

  it("ordre déterministe : date de liaison puis identifiant", async () => {
    const a = await freshClient("order-a");
    const b = await freshClient("order-b");
    await api().add(scene.projects.old, a.memberId);
    await api().add(scene.projects.old, b.memberId);
    const ids = (await api().list(scene.projects.old)).body.map(
      (c: { memberId: string }) => c.memberId,
    );
    expect(ids).toEqual([a.memberId, b.memberId]);
  });

  it("un id de projet mal formé est refusé en 422, jamais en 500", async () => {
    const res = await send(app, scene.staff.owner.cookie, "get", "/projects/pas-un-uuid/clients");
    expect(res.status).toBe(422);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("projectClient.remove", () => {
  it("retire le lien : { removed: true }, ligne supprimée, accès fermé aussitôt", async () => {
    const client = await freshClient("remove-ok");
    await api().add(scene.projects.p1, client.memberId);
    expect((await send(app, client.cookie, "get", "/tickets")).status).toBe(200);
    const res = await api().remove(scene.projects.p1, client.memberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ removed: true });
    expect((await linkRows(database, scene.projects.p1)).map((r) => r.user_id)).not.toContain(
      client.userId,
    );
    expect((await send(app, client.cookie, "get", "/tickets")).status).toBe(404);
  });

  it("idempotent : retirer un lien absent est un 200 { removed: false }, sans audit", async () => {
    const client = await freshClient("remove-idem");
    await api().add(scene.projects.p1, client.memberId);
    await api().remove(scene.projects.p1, client.memberId);
    const before = await auditOf(database, scene.organizationId, ["project_client.remove"]);
    const again = await api().remove(scene.projects.p1, client.memberId);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ removed: false });
    const unrelated = await api().remove(scene.projects.p1, scene.staff.dev.memberId);
    expect(unrelated.status).toBe(200);
    expect(unrelated.body).toEqual({ removed: false });
    const foreignMember = await api().remove(scene.projects.p1, scene.foreign.client.memberId);
    expect(foreignMember.body).toEqual({ removed: false });
    expect(await auditOf(database, scene.organizationId, ["project_client.remove"])).toHaveLength(
      before.length,
    );
  });

  it("ne retire que le lien du projet visé : les autres liens du client et des autres clients survivent", async () => {
    const client = await freshClient("remove-scoped");
    await api().add(scene.projects.p1, client.memberId);
    await api().add(scene.projects.p2, client.memberId);
    await api().remove(scene.projects.p1, client.memberId);
    expect((await linkRows(database, scene.projects.p2)).map((r) => r.user_id)).toEqual(
      expect.arrayContaining([client.userId, scene.c2.userId]),
    );
    expect((await linkRows(database, scene.projects.p1)).map((r) => r.user_id)).toContain(
      scene.c1.userId,
    );
  });

  it("projet d'une autre organisation ou inexistant : 404 identiques, lien étranger intact", async () => {
    const foreign = await api().remove(scene.foreign.projectId, scene.foreign.client.memberId);
    const unknown = await api().remove(randomUUID(), scene.foreign.client.memberId);
    expect(foreign.status).toBe(404);
    expect(shapeOf(foreign)).toEqual(shapeOf(unknown));
    expect(await linkRows(database, scene.foreign.projectId)).toHaveLength(1);
  });

  it("audit : une entrée project_client.remove dont la cible est la ligne supprimée", async () => {
    const client = await freshClient("remove-audit");
    await api().add(scene.projects.p1, client.memberId);
    const row = (await linkRows(database, scene.projects.p1)).find(
      (r) => r.user_id === client.userId,
    );
    await api().remove(scene.projects.p1, client.memberId);
    const entries = (
      await auditOf(database, scene.organizationId, ["project_client.remove"])
    ).filter((a) => a.target_id === row?.id);
    expect(entries).toEqual([
      {
        action: "project_client.remove",
        target_kind: "project_client",
        target_id: row?.id,
        actor_id: scene.staff.owner.userId,
        ticket_id: null,
      },
    ]);
  });

  it("atomique : si l'audit échoue, le lien est conservé (500 INTERNAL)", async () => {
    const client = await freshClient("remove-atomic");
    await api().add(scene.projects.p1, client.memberId);
    await database.query("INSERT INTO audit_fail (action) VALUES ('project_client.remove')");
    try {
      const res = await api().remove(scene.projects.p1, client.memberId);
      expect(res.status).toBe(500);
    } finally {
      await database.query("DELETE FROM audit_fail");
    }
    expect((await linkRows(database, scene.projects.p1)).map((r) => r.user_id)).toContain(
      client.userId,
    );
  });
});

describe("cloisonnement entre organisations pour un utilisateur à deux appartenances", () => {
  it("un lien posé dans l'organisation B ne peut pas être listé ni retiré depuis l'organisation A", async () => {
    const dual = await freshClient("dual");
    await database.query(
      `INSERT INTO members (id, organization_id, user_id, role, created_at, updated_at)
       VALUES ($1, $2, $3, 'client', now(), now())`,
      [randomUUID(), scene.foreign.organizationId, dual.userId],
    );
    await linkClient(database, scene.foreign.organizationId, scene.foreign.projectId, dual.userId);
    const removed = await api().remove(scene.projects.p1, dual.memberId);
    expect(removed.body).toEqual({ removed: false });
    expect((await linkRows(database, scene.foreign.projectId)).map((r) => r.user_id)).toContain(
      dual.userId,
    );
  });
});
