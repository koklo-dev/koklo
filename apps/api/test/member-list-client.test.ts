import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { type ClientScene, createClientScene, STAFF } from "./helpers/client-scene.ts";
import { insertActor } from "./helpers/organizations.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-55 B1 : `member.list` renvoie nom, e-mail et rôle de tout membre de l'organisation ; il est
 * fermé au client (lié ou non) et à tout rôle inconnu (fail-closed), comme `spec.*`.
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

const list = (actor: { cookie: string }) => send(app, actor.cookie, "get", "/members");

describe("member.list fermé au client", () => {
  it.each(["c1", "c3"] as const)(
    "client %s (lié ou non) : 403 FORBIDDEN sans fuite",
    async (key) => {
      const res = await list(scene[key]);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
      expect(JSON.stringify(res.body)).not.toContain("@");
    },
  );

  it("rôle inconnu : 403 (fail-closed)", async () => {
    const other = await createClientScene(database);
    const unknown = await insertActor(database, other.organizationId, "dev", "role-inconnu");
    await database.query("UPDATE members SET role = 'member' WHERE id = $1", [unknown.memberId]);
    expect((await list(unknown)).status).toBe(403);
  });

  it.each(STAFF)("%s : 200 et la liste de l'organisation", async (role) => {
    const res = await list(scene.staff[role]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(8);
  });
});
