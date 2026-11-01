import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { type ClientScene, createClientScene } from "./helpers/client-scene.ts";
import { insertActor, roleInDatabase } from "./helpers/organizations.ts";
import { linkCountOfUser, projectClientApi } from "./helpers/project-client.ts";

/**
 * TK-55 N1 : `projectClient.add` lit le rôle du membre puis insère le lien. Un changement de rôle
 * client -> dev commité entre les deux laissait un lien orphelin, ressuscité si le membre
 * redevenait client. Le test fige la course : une transaction externe change le rôle (verrou de
 * ligne tenu) pendant que `add` démarre ; `add` doit attendre ce verrou, relire le rôle et refuser.
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

const HOLD_MS = 1500;

async function waitUntil(condition: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error("condition jamais atteinte");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("projectClient.add face à un changement de rôle concurrent", () => {
  it("add attend le verrou du membre, relit son rôle et ne laisse aucun lien orphelin", async () => {
    const client = await insertActor(database, scene.organizationId, "client", "race");
    const changing = database.query(
      `BEGIN;
       UPDATE members SET role = 'dev' WHERE id = '${client.memberId}';
       SELECT pg_sleep(${HOLD_MS / 1000});
       COMMIT;`,
    );
    await waitUntil(async () => {
      const rows = await database.query(
        "SELECT 1 FROM pg_stat_activity WHERE query LIKE '%pg_sleep%' AND query NOT LIKE '%pg_stat_activity%' AND state = 'active'",
      );
      return rows.length > 0;
    });

    const started = Date.now();
    const added = await projectClientApi(app, scene.staff.owner).add(
      scene.projects.p1,
      client.memberId,
    );
    await changing;

    expect(await roleInDatabase(database, client.memberId)).toBe("dev");
    expect(added.status, JSON.stringify(added.body)).toBe(422);
    expect(Date.now() - started).toBeGreaterThan(HOLD_MS / 3);
    expect(await linkCountOfUser(database, client.userId)).toBe(0);
  });
});
