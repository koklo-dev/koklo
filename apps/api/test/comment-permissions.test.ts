import type { Role } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import { commentRows, commentsFor } from "./helpers/comments.ts";
import { auditCount, createAppWithClock, ManualClock } from "./helpers/leases.ts";
import { ROLES } from "./helpers/organizations.ts";
import { createWorld, seedTicket } from "./helpers/tickets.ts";

/** TK-32 : matrice de rôles des commentaires (CDC §14), rôle relu en base, 401 sans session. */
let database: TestDatabase;
let app: INestApplication;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createAppWithClock(database.url, new ManualClock());
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const CREATE_ALLOWED: Role[] = ["owner", "admin", "dev", "designer", "client"];

describe("comment.create", () => {
  it.each(CREATE_ALLOWED)("%s peut commenter", async (role) => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    const response = await commentsFor(app, world.actors[role]).create(ticket.id);
    expect(response.status).toBe(200);
  });

  it("business reçoit FORBIDDEN (403), sans commentaire ni audit", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);

    const response = await commentsFor(app, world.actors.business).create(ticket.id);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
    expect(await commentRows(database, world.organizationId)).toHaveLength(0);
    expect(await auditCount(database, world.organizationId, "comment.create")).toBe(0);
  });

  it("sans session : 401 UNAUTHORIZED", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    const anonymous = commentsFor(app, undefined);
    expect((await anonymous.create(ticket.id)).status).toBe(401);
    expect((await anonymous.list(ticket.id)).status).toBe(401);
    expect((await anonymous.remove(ticket.id)).status).toBe(401);
  });

  it("le rôle est relu en base : un designer rétrogradé business est refusé", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    await database.query("UPDATE members SET role = 'business' WHERE id = $1", [
      world.actors.designer.memberId,
    ]);
    expect((await commentsFor(app, world.actors.designer).create(ticket.id)).status).toBe(403);
  });
});

async function commentBy(author: Role) {
  const world = await createWorld(database);
  const ticket = await seedTicket(app, world.actors.dev);
  const comment = (await commentsFor(app, world.actors[author]).create(ticket.id)).body;
  return { world, comment };
}

describe("comment.delete : auteur, owner et admin", () => {
  it.each(CREATE_ALLOWED)("%s supprime son propre commentaire", async (role) => {
    const { world, comment } = await commentBy(role);
    const response = await commentsFor(app, world.actors[role]).remove(comment.id);
    expect(response.status).toBe(200);
    expect((await commentRows(database, world.organizationId))[0]?.deleted_at).not.toBeNull();
  });

  it.each(["owner", "admin"] as const)(
    "%s supprime le commentaire d'autrui (modération)",
    async (role) => {
      const { world, comment } = await commentBy("client");
      const response = await commentsFor(app, world.actors[role]).remove(comment.id);
      expect(response.status).toBe(200);
      expect(await auditCount(database, world.organizationId, "comment.delete")).toBe(1);
    },
  );

  it.each(["dev", "designer", "client"] as const)(
    "%s ne supprime pas le commentaire d'autrui : FORBIDDEN, rien modifié, pas d'audit",
    async (role) => {
      const { world, comment } = await commentBy("owner");

      const response = await commentsFor(app, world.actors[role]).remove(comment.id);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("FORBIDDEN");
      expect((await commentRows(database, world.organizationId))[0]?.deleted_at).toBeNull();
      expect(await auditCount(database, world.organizationId, "comment.delete")).toBe(0);
    },
  );
});

describe("comment.delete (suite 2)", () => {
  it("business reçoit FORBIDDEN, même sur le commentaire d'un autre", async () => {
    const { world, comment } = await commentBy("dev");
    const response = await commentsFor(app, world.actors.business).remove(comment.id);
    expect(response.status).toBe(403);
    expect((await commentRows(database, world.organizationId))[0]?.deleted_at).toBeNull();
  });

  it("404 avant 403 : un commentaire inconnu ou déjà supprimé est NOT_FOUND pour un non-auteur", async () => {
    const { world, comment } = await commentBy("owner");
    expect((await commentsFor(app, world.actors.owner).remove(comment.id)).status).toBe(200);

    const deleted = await commentsFor(app, world.actors.dev).remove(comment.id);
    const unknown = await commentsFor(app, world.actors.dev).remove(
      "00000000-0000-4000-8000-000000000001",
    );

    expect(deleted.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(deleted.body.code).toBe("NOT_FOUND");
  });

  it("l'id d'un commentaire d'une autre organisation répond 404, jamais 403 (pas de fuite d'existence)", async () => {
    const one = await commentBy("owner");
    const two = await createWorld(database);
    const response = await commentsFor(app, two.actors.dev).remove(one.comment.id);
    expect(response.status).toBe(404);
    expect(response.body.code).toBe("NOT_FOUND");
  });
});

describe("tous les rôles lisent les commentaires", () => {
  it.each(ROLES)("%s : comment.list répond 200", async (role) => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    expect((await commentsFor(app, world.actors[role]).list(ticket.id)).status).toBe(200);
  });
});
