import type { Role } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import {
  type Actor,
  call,
  count,
  insertActor,
  insertOrganization,
  insertSessionWithoutOrganization,
  ROLES,
  roleInDatabase,
  startQueueBoss,
  tokenOfCookie,
} from "./helpers/organizations.ts";

/**
 * TK-23 C1, C2, C3, C4 : matrice de permissions (CDC §14, hypothèses H1 à H3), garde « session
 * seule » et rôle lu dans la table members. Session Better Auth réelle (cookie signé).
 */
let database: TestDatabase;
let app: INestApplication;
let boss: PgBoss;
let orgId: string;
const actors = {} as Record<Role, Actor>;
let target: Actor;
let counter = 0;

beforeAll(async () => {
  database = await createSeededDatabase();
  boss = await startQueueBoss(database);
  app = await createApp({ databaseUrl: database.url });
  orgId = await insertOrganization(database, "matrice");
  for (const role of ROLES) {
    actors[role] = await insertActor(database, orgId, role);
  }
  target = await insertActor(database, orgId, "dev", "cible");
});

afterAll(async () => {
  await app?.close();
  await boss?.stop();
  await database?.dispose();
});

interface Procedure {
  name: string;
  allowed: readonly Role[];
  run: (actor: Actor) => ReturnType<typeof call>;
}

const unique = () => `${Date.now()}-${++counter}`;
const everyRole = ROLES;
const ownerAndAdmin = ["owner", "admin"] as const;

const procedures: Procedure[] = [
  {
    name: "organization.create",
    allowed: everyRole,
    run: (a) => call(app, a.cookie, "post", "/organizations", { name: `Org ${unique()}` }),
  },
  {
    name: "organization.list",
    allowed: everyRole,
    run: (a) => call(app, a.cookie, "get", "/organizations"),
  },
  {
    name: "member.list",
    allowed: ["owner", "admin", "dev", "designer", "business"],
    run: (a) => call(app, a.cookie, "get", "/members"),
  },
  {
    name: "member.invite",
    allowed: ownerAndAdmin,
    run: (a) =>
      call(app, a.cookie, "post", "/members/invitations", {
        email: `invite-${unique()}@example.test`,
        role: "dev",
      }),
  },
  {
    name: "member.setRole",
    allowed: ownerAndAdmin,
    run: (a) =>
      call(app, a.cookie, "patch", `/members/${target.memberId}/role`, {
        memberId: target.memberId,
        role: "designer",
      }),
  },
  {
    name: "project.create",
    allowed: ownerAndAdmin,
    run: (a) => call(app, a.cookie, "post", "/projects", { name: `Projet ${unique()}` }),
  },
];

describe("matrice de permissions (C1)", () => {
  for (const procedure of procedures) {
    describe(procedure.name, () => {
      it.each(ROLES)("rôle %s", async (role) => {
        // Chaque rôle est testé sur une session fraîche : organization.create change l'org active.
        const actor = await insertActor(database, orgId, role);
        const response = await procedure.run(actor);
        if (procedure.allowed.includes(role)) {
          expect(response.status, JSON.stringify(response.body)).toBe(200);
        } else {
          expect(response.status).toBe(403);
          expect(response.body.code).toBe("FORBIDDEN");
        }
      });
    });
  }
});

describe("project.create refusé (C2)", () => {
  it.each(["client", "business", "designer", "dev"] as const)(
    "%s : 403 et aucun projet créé en base",
    async (role) => {
      const before = await count(database, "projects");
      const response = await call(app, actors[role].cookie, "post", "/projects", {
        name: `Interdit ${role}`,
      });
      expect(response.status).toBe(403);
      expect(await count(database, "projects")).toBe(before);
      expect(await count(database, "projects", "name = $1", [`Interdit ${role}`])).toBe(0);
    },
  );

  it("owner et admin créent un projet dans l'organisation de la session", async () => {
    for (const role of ownerAndAdmin) {
      const response = await call(app, actors[role].cookie, "post", "/projects", {
        name: `Projet ${role}`,
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: expect.any(String), name: `Projet ${role}` });
      const rows = await database.query<{ organization_id: string }>(
        "SELECT organization_id FROM projects WHERE id = $1",
        [response.body.id],
      );
      expect(rows[0]?.organization_id).toBe(orgId);
    }
  });
});

describe("garde de session (C3)", () => {
  const routes: [string, "get" | "post" | "patch", string, Record<string, unknown>?][] = [
    ["organization.create", "post", "/organizations", { name: "X" }],
    ["organization.list", "get", "/organizations"],
    ["member.list", "get", "/members"],
    ["member.invite", "post", "/members/invitations", { email: "a@b.test", role: "dev" }],
    [
      "member.setRole",
      "patch",
      "/members/01900000-0000-7000-8000-0000000000f1/role",
      { memberId: "01900000-0000-7000-8000-0000000000f1", role: "dev" },
    ],
    ["project.create", "post", "/projects", { name: "X" }],
  ];

  it.each(routes)("%s sans session : 401", async (_name, method, path, body) => {
    const response = await call(app, undefined, method, path, body);
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
  });

  it.each(routes.slice(2))(
    "%s avec session sans organisation active : 401",
    async (_name, method, path, body) => {
      const { cookie } = await insertSessionWithoutOrganization(database);
      expect((await call(app, cookie, method, path, body)).status).toBe(401);
    },
  );

  it("organization.create et organization.list acceptent une session sans organisation active", async () => {
    const { cookie } = await insertSessionWithoutOrganization(database);
    expect((await call(app, cookie, "get", "/organizations")).status).toBe(200);
    const created = await call(app, cookie, "post", "/organizations", { name: "Première org" });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
  });
});

describe("organisation active après création (C4)", () => {
  it("l'organisation créée devient active sur la session et project.create réussit ensuite", async () => {
    const { userId, cookie } = await insertSessionWithoutOrganization(database);
    const created = await call(app, cookie, "post", "/organizations", { name: "Cabinet Dupont" });
    expect(created.status).toBe(200);

    const sessions = await database.query<{ active_organization_id: string | null }>(
      "SELECT active_organization_id FROM sessions WHERE token = $1",
      [tokenOfCookie(cookie)],
    );
    expect(sessions[0]?.active_organization_id).toBe(created.body.id);
    const members = await database.query<{ role: string }>(
      "SELECT role FROM members WHERE organization_id = $1 AND user_id = $2",
      [created.body.id, userId],
    );
    expect(members.map((m) => m.role)).toEqual(["owner"]);

    const project = await call(app, cookie, "post", "/projects", { name: "Premier projet" });
    expect(project.status).toBe(200);
    const rows = await database.query<{ organization_id: string }>(
      "SELECT organization_id FROM projects WHERE id = $1",
      [project.body.id],
    );
    expect(rows[0]?.organization_id).toBe(created.body.id);
  });

  it("organization.list ne renvoie que les organisations de l'appelant, avec son rôle", async () => {
    const mine = await insertOrganization(database, `liste-a-${unique()}`);
    const hidden = await insertOrganization(database, `liste-b-${unique()}`);
    const actor = await insertActor(database, mine, "designer");
    await insertActor(database, hidden, "owner");
    const response = await call(app, actor.cookie, "get", "/organizations");
    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: mine, name: expect.any(String), slug: expect.any(String), role: "designer" },
    ]);
  });
});

describe("le rôle vient de la table members, jamais de l'entrée (C1)", () => {
  it("un dev qui déclare un rôle owner dans l'entrée reste refusé", async () => {
    const dev = await insertActor(database, orgId, "dev");
    const before = await count(database, "projects");
    const response = await call(app, dev.cookie, "post", "/projects", {
      name: "Contournement",
      role: "owner",
      actorRole: "owner",
      organizationId: orgId,
    });
    expect([400, 403]).toContain(response.status);
    expect(response.status).not.toBe(200);
    expect(await count(database, "projects")).toBe(before);
    const invite = await call(app, dev.cookie, "post", "/members/invitations", {
      email: "x@example.test",
      role: "dev",
      actorRole: "owner",
    });
    expect(invite.status).toBe(403);
  });

  it("le rôle est relu à chaque requête : rétrogradé en base, la même session est refusée", async () => {
    const admin = await insertActor(database, orgId, "admin");
    expect((await call(app, admin.cookie, "post", "/projects", { name: "Avant" })).status).toBe(
      200,
    );
    await database.query("UPDATE members SET role = 'client' WHERE id = $1", [admin.memberId]);
    expect((await call(app, admin.cookie, "post", "/projects", { name: "Après" })).status).toBe(
      403,
    );
    expect(await roleInDatabase(database, admin.memberId)).toBe("client");
  });

  it("un organizationId d'une autre organisation dans l'entrée est ignoré (valeur de session)", async () => {
    const other = await insertOrganization(database, `autre-${unique()}`);
    const response = await call(app, actors.admin.cookie, "post", "/projects", {
      name: "Reste chez moi",
      organizationId: other,
    });
    expect(response.status).toBe(200);
    expect(await count(database, "projects", "organization_id = $1", [other])).toBe(0);
  });
});
