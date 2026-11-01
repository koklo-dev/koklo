import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import {
  type ClientScene,
  createClientScene,
  linkClient,
  medianDuration,
  P1_WORKTREE,
  type SeededTickets,
  STAFF,
  seedWork,
  shapeOf,
} from "./helpers/client-scene.ts";
import { type Actor, insertActor } from "./helpers/organizations.ts";
import { createAppForProject, send } from "./helpers/tickets.ts";

/**
 * TK-55a : cloisonnement des procédures « contexte de projet » (tickets, commentaires, baux,
 * sprints, dépendances). Aujourd'hui `OldestProjectContext` prend le plus ancien projet de
 * l'organisation sans regarder le rôle : un client lit le projet d'un autre client (IDOR). Un
 * client n'atteint que ses projets liés, tout autre cas est un 404 UNIFORME (jamais 403).
 */
let database: TestDatabase;
let app: INestApplication;
let scene: ClientScene;
let work: SeededTickets;
const apps: INestApplication[] = [];

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  scene = await createClientScene(database);
  work = await seedWork(database, scene);
}, 120_000);

afterAll(async () => {
  await Promise.all([app, ...apps].map((a) => a?.close()));
  await database?.dispose();
});

const get = (actor: Pick<Actor, "cookie">, path: string, target = app) =>
  send(target, actor.cookie, "get", path);
const titles = (body: { items: { title: string }[] }) => body.items.map((t) => t.title).sort();
const NOT_FOUND = { status: 404, code: "NOT_FOUND" };

async function forcedApp(projectId: string) {
  const forced = await createAppForProject(database.url, projectId);
  apps.push(forced);
  return forced;
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("client lié : voit son projet, pas celui de l'autre client", () => {
  it("ticket.list : chaque client ne reçoit que les tickets de son projet lié", async () => {
    const one = await get(scene.c1, "/tickets");
    const two = await get(scene.c2, "/tickets");
    expect(one.status, JSON.stringify(one.body)).toBe(200);
    expect(titles(one.body)).toEqual(["secret-p1-1", "secret-p1-2"]);
    expect(titles(two.body)).toEqual(["secret-p2-1", "secret-p2-2", "secret-p2-3"]);
  });

  it("le client ne reçoit pas le projet le plus ancien de l'organisation", async () => {
    const one = await get(scene.c1, "/tickets");
    expect(JSON.stringify(one.body)).not.toContain("secret-old-1");
  });

  it("ticket.get : un ticket du projet lié est lisible, celui d'un autre projet est introuvable", async () => {
    const own = await get(scene.c1, `/tickets/${work.p1.tickets[1]?.key}`);
    expect(own.status).toBe(200);
    expect(own.body.title).toBe("secret-p1-2");
    // TK-3 n'existe que dans p2 : introuvable pour c1.
    const other = await get(scene.c1, `/tickets/${work.p2.tickets[2]?.key}`);
    expect(other.status).toBe(404);
    expect(JSON.stringify(other.body)).not.toContain("secret-p2-3");
  });

  it("dependency.list, sprint.list et sprint.get restent dans le projet lié", async () => {
    const deps = await get(scene.c1, `/tickets/${work.p1.tickets[0]?.key}/dependencies`);
    expect(deps.status).toBe(200);
    const sprints = await get(scene.c2, "/sprints");
    expect(sprints.status).toBe(200);
    expect(JSON.stringify(sprints.body)).toContain("goal-p2-1");
    expect(JSON.stringify(sprints.body)).not.toContain("goal-p1-1");
    expect(JSON.stringify(sprints.body)).not.toContain("goal-old-1");
    const sprintOfP2 = await get(scene.c1, `/sprints/${work.p2.sprints[1]?.key}`);
    expect(sprintOfP2.status).toBe(404);
  });

  it("lease.get : le bail d'un ticket du projet lié est lisible (sans worktree), pas celui d'un autre projet", async () => {
    const own = await get(scene.c1, `/tickets/${work.p1.tickets[1]?.key}/lease`);
    expect(own.status, JSON.stringify(own.body)).toBe(200);
    expect(JSON.stringify(own.body)).not.toContain(P1_WORKTREE);
    // c2 vise la même clé TK-2, qui est un autre ticket dans p2 : jamais le bail de p1.
    const other = await get(scene.c2, `/tickets/${work.p1.tickets[1]?.key}/lease`);
    expect(JSON.stringify(other.body)).not.toContain(P1_WORKTREE);
    expect(JSON.stringify(other.body)).not.toContain("feat/tk-x");
  });

  it("comment : le client commente un ticket de son projet lié, jamais celui d'un autre projet", async () => {
    const ok = await send(app, scene.c1.cookie, "post", "/comments", {
      targetKind: "ticket",
      targetId: work.p1.tickets[0]?.id,
      body: "Une remarque du client 1",
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const listed = await get(
      scene.c1,
      `/comments?targetKind=ticket&targetId=${work.p1.tickets[0]?.id}`,
    );
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).toContain("Une remarque du client 1");

    const foreignTargets = [
      work.p2.tickets[0]?.id,
      work.old.tickets[0]?.id,
      work.foreign.tickets[0]?.id,
    ];
    for (const targetId of foreignTargets) {
      const write = await send(app, scene.c1.cookie, "post", "/comments", {
        targetKind: "ticket",
        targetId,
        body: "Intrusion",
      });
      expect(write.status, String(targetId)).toBe(404);
      const read = await get(scene.c1, `/comments?targetKind=ticket&targetId=${targetId}`);
      expect(read.status, String(targetId)).toBe(404);
    }
    const rows = await database.query("SELECT 1 FROM ticket_comments WHERE body = 'Intrusion'");
    expect(rows).toEqual([]);
  });

  it("client d'une autre organisation : voit son projet, jamais ceux de l'organisation A", async () => {
    const res = await get(scene.foreign.client, "/tickets");
    expect(titles(res.body)).toEqual(["secret-foreign-1"]);
  });
});

describe("client sans lien : 404 sur toute procédure de projet", () => {
  const probes = (): [string, string][] => [
    ["ticket.list", "/tickets"],
    ["ticket.get", `/tickets/${work.old.tickets[0]?.key}`],
    ["dependency.list", `/tickets/${work.old.tickets[0]?.key}/dependencies`],
    ["sprint.list", "/sprints"],
    ["sprint.get", `/sprints/${work.old.sprints[0]?.key}`],
    ["lease.get", `/tickets/${work.old.tickets[0]?.key}/lease`],
    ["comment.list", `/comments?targetKind=ticket&targetId=${work.old.tickets[0]?.id}`],
  ];

  it("chaque lecture répond 404 NOT_FOUND, sans donnée d'aucun projet", async () => {
    for (const [name, path] of probes()) {
      const res = await get(scene.c3, path);
      expect(res.status, name).toBe(NOT_FOUND.status);
      expect(res.body.code, name).toBe(NOT_FOUND.code);
      expect(JSON.stringify(res.body), name).not.toMatch(/secret-|goal-/);
    }
  });

  it("comment.create est refusé en 404 et n'écrit rien", async () => {
    const res = await send(app, scene.c3.cookie, "post", "/comments", {
      targetKind: "ticket",
      targetId: work.old.tickets[0]?.id,
      body: "Commentaire sans lien",
    });
    expect(res.status).toBe(404);
    expect(
      await database.query("SELECT 1 FROM ticket_comments WHERE body = 'Commentaire sans lien'"),
    ).toEqual([]);
  });

  it("le refus est identique, au corps près, pour tout motif d'inaccessibilité (aucun oracle)", async () => {
    // Lecture d'un ticket qui existe ailleurs / n'existe nulle part / dans l'organisation étrangère.
    const existsElsewhere = await get(scene.c3, `/tickets/${work.old.tickets[0]?.key}`);
    const missing = await get(scene.c3, "/tickets/TK-999");
    const linkedClientMissing = await get(scene.c1, "/tickets/TK-999");
    const foreignClientMissing = await get(scene.foreign.client, "/tickets/TK-999");
    const reference = shapeOf(linkedClientMissing);
    expect(reference.status).toBe(404);
    for (const res of [existsElsewhere, missing, foreignClientMissing]) {
      expect(shapeOf(res)).toEqual(reference);
    }
  });

  it("même durée approximative : projet inaccessible et ticket absent d'un projet lié", async () => {
    const path = `/tickets/${work.old.tickets[0]?.key}`;
    await get(scene.c3, path);
    await get(scene.c1, "/tickets/TK-999");
    const denied = await medianDuration(15, () => get(scene.c3, path));
    const absent = await medianDuration(15, () => get(scene.c1, "/tickets/TK-999"));
    expect(Math.abs(denied - absent), `inaccessible ${denied}ms, absent ${absent}ms`).toBeLessThan(
      100,
    );
    expect(denied / absent).toBeLessThan(4);
    expect(absent / denied).toBeLessThan(4);
  });
});

describe("matrice 6 rôles x projet lié / non lié / autre organisation (projet imposé)", () => {
  const read = async (actor: Pick<Actor, "cookie">, projectId: string) =>
    get(actor, "/tickets", await forcedApp(projectId));

  it.each(STAFF)(
    "%s : tout projet de l'organisation (200), 404 hors organisation",
    async (role) => {
      const actor = scene.staff[role];
      expect((await read(actor, scene.projects.p1)).status).toBe(200);
      expect((await read(actor, scene.projects.p2)).status).toBe(200);
      expect((await read(actor, scene.projects.old)).status).toBe(200);
      const foreign = await read(actor, scene.foreign.projectId);
      expect(foreign.status).toBe(404);
      expect(foreign.body.code).toBe("NOT_FOUND");
    },
  );

  it("client c1 : p1 (lié) 200 ; p2, ancien projet, projet étranger et projet inconnu : 404 identiques", async () => {
    expect((await read(scene.c1, scene.projects.p1)).status).toBe(200);
    const denied = [
      await read(scene.c1, scene.projects.p2),
      await read(scene.c1, scene.projects.old),
      await read(scene.c1, scene.foreign.projectId),
      await read(scene.c1, randomUUID()),
    ];
    for (const res of denied) {
      expect(res.status).toBe(404);
      expect(shapeOf(res)).toEqual(shapeOf(denied[0] as never));
    }
  });

  it("client c2 : p2 (lié) 200, p1 404 ; client c3 : 404 partout", async () => {
    expect((await read(scene.c2, scene.projects.p2)).status).toBe(200);
    expect((await read(scene.c2, scene.projects.p1)).status).toBe(404);
    for (const projectId of Object.values(scene.projects)) {
      expect((await read(scene.c3, projectId)).status, projectId).toBe(404);
    }
  });

  it("client étranger : jamais un projet de l'organisation A, même imposé", async () => {
    for (const projectId of Object.values(scene.projects)) {
      expect((await read(scene.foreign.client, projectId)).status, projectId).toBe(404);
    }
  });

  it("écriture par un rôle d'écriture sur un projet étranger imposé : 404, rien n'est créé", async () => {
    const forced = await forcedApp(scene.foreign.projectId);
    const res = await send(forced, scene.staff.owner.cookie, "post", "/tickets", {
      title: "Intrusion tenant",
      type: "task",
      priority: "medium",
      pkg: "api",
      sensitivity: "safe",
    });
    expect(res.status).toBe(404);
    expect(await database.query("SELECT 1 FROM tickets WHERE title = 'Intrusion tenant'")).toEqual(
      [],
    );
  });
});

describe("équipe et business : comportement historique inchangé", () => {
  it.each(STAFF)("%s lit le plus ancien projet de l'organisation (contexte v1)", async (role) => {
    const res = await get(scene.staff[role], "/tickets");
    expect(res.status).toBe(200);
    expect(titles(res.body)).toEqual(["secret-old-1"]);
  });

  it("un membre d'équipe ne dépend d'aucun lien : un lien ajouté ou retiré n'y change rien", async () => {
    const dev = await insertActor(database, scene.organizationId, "dev", "dev-with-link");
    await linkClient(database, scene.organizationId, scene.projects.p2, dev.userId);
    expect(titles((await get(dev, "/tickets")).body)).toEqual(["secret-old-1"]);
  });
});

describe("un client ne peut pas éditer : seules écritures, suggérer/valider (plus tard) et commenter", () => {
  const forbidden = (): [
    string,
    "post" | "patch" | "put" | "delete",
    string,
    Record<string, unknown>?,
  ][] => [
    [
      "ticket.create",
      "post",
      "/tickets",
      { title: "x", type: "task", priority: "low", pkg: "api", sensitivity: "safe" },
    ],
    ["ticket.delete", "delete", `/tickets/${work.p1.tickets[0]?.key}`],
    [
      "ticket.transition",
      "post",
      `/tickets/${work.p1.tickets[0]?.key}/transition`,
      { key: work.p1.tickets[0]?.key, to: "done" },
    ],
    [
      "sprint.create",
      "post",
      "/sprints",
      { goal: "x", startsOn: "2026-11-02", endsOn: "2026-11-13" },
    ],
    [
      "lease.acquire",
      "post",
      `/tickets/${work.p1.tickets[0]?.key}/lease`,
      { key: work.p1.tickets[0]?.key, branch: "b", worktree: "/w" },
    ],
  ];

  it.each([0, 1, 2, 3, 4])(
    "écriture interdite #%i : 403 FORBIDDEN pour un client lié, même sur son projet",
    async (i) => {
      const [name, method, path, body] = forbidden()[i] as ReturnType<typeof forbidden>[number];
      const res = await send(app, scene.c1.cookie, method, path, body);
      expect(res.status, name).toBe(403);
      expect(res.body.code, name).toBe("FORBIDDEN");
    },
  );

  it("projectState.get est refusé au client (403), lié ou non", async () => {
    expect((await get(scene.c1, "/project-state")).status).toBe(403);
    expect((await get(scene.c3, "/project-state")).status).toBe(403);
  });

  it("le refus de rôle (403) précède le cloisonnement : un client non lié écrit en 403, pas en 404", async () => {
    const res = await send(app, scene.c3.cookie, "post", "/tickets", {
      title: "x",
      type: "task",
      priority: "low",
      pkg: "api",
      sensitivity: "safe",
    });
    expect(res.status).toBe(403);
  });
});

describe("lien retiré ou rôle changé : effet immédiat avec la session existante", () => {
  it("retirer le lien ferme l'accès au prochain appel", async () => {
    const actor = await insertActor(database, scene.organizationId, "client", "client-revoked");
    await linkClient(database, scene.organizationId, scene.projects.p1, actor.userId);
    expect((await get(actor, "/tickets")).status).toBe(200);
    await database.query("DELETE FROM project_client_access WHERE user_id = $1", [actor.userId]);
    expect((await get(actor, "/tickets")).status).toBe(404);
  });

  it("un client lié à plusieurs projets est servi sur le plus ancien des siens", async () => {
    const actor = await insertActor(database, scene.organizationId, "client", "client-two");
    await linkClient(database, scene.organizationId, scene.projects.p2, actor.userId);
    await linkClient(database, scene.organizationId, scene.projects.p1, actor.userId);
    expect(titles((await get(actor, "/tickets")).body)).toEqual(["secret-p1-1", "secret-p1-2"]);
  });

  it("rétrogradé de dev à client sans lien : 404 avec la session existante", async () => {
    const actor = await insertActor(database, scene.organizationId, "dev", "dev-to-client");
    expect((await get(actor, "/tickets")).status).toBe(200);
    await database.query("UPDATE members SET role = 'client' WHERE id = $1", [actor.memberId]);
    expect((await get(actor, "/tickets")).status).toBe(404);
  });
});

describe("fail-closed : session sans rôle ou à rôle inconnu", () => {
  async function fixed(role?: string) {
    const built = await createApp({
      databaseUrl: database.url,
      organizationId: scene.organizationId,
      ...(role === undefined ? {} : { role }),
    });
    apps.push(built);
    return built;
  }

  it("session sans rôle : ticket.list est 404, comme un client non lié", async () => {
    const res = await send(await fixed(), undefined, "get", "/tickets");
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain("secret-");
  });

  it("rôle hérité `member` : 404 également", async () => {
    const res = await send(await fixed("member"), undefined, "get", "/tickets");
    expect(res.status).toBe(404);
  });

  it("session de test par en-tête d'un client non lié : 404 ; d'un membre d'équipe : 200", async () => {
    const client = await send(app, undefined, "get", "/tickets").set(
      "x-test-session",
      `${scene.c3.userId}:${scene.organizationId}`,
    );
    expect(client.status).toBe(404);
    const dev = await send(app, undefined, "get", "/tickets").set(
      "x-test-session",
      `${scene.staff.dev.userId}:${scene.organizationId}`,
    );
    expect(dev.status).toBe(200);
  });
});
