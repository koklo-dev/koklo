import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import { createMagicLinkApp, logSink } from "./helpers/magic-link.ts";
import {
  call,
  count,
  insertActor,
  insertOrganization,
  SEND_INVITATION_QUEUE,
  startQueueBoss,
} from "./helpers/organizations.ts";

/**
 * TK-23 C6 (côté api) : member.invite enfile exactement un job send-invitation. Aucun worker : le
 * job reste en file et se lit tel que le worker le recevra.
 * Contrat du payload : { email, url, inviterName, organizationName, role }.
 */
let database: TestDatabase;
let app: INestApplication;
let boss: PgBoss;
const sink = logSink();

beforeAll(async () => {
  database = await createSeededDatabase();
  boss = await startQueueBoss(database);
  app = await createMagicLinkApp(database.url, sink);
});

afterAll(async () => {
  await app?.close();
  await boss?.stop();
  await database?.dispose();
});

describe("api : member.invite enfile l'envoi (TK-23 C6)", () => {
  it("crée l'invitation pending et enfile exactement un job avec lien d'acceptation", async () => {
    const orgId = await insertOrganization(database, "enfilage");
    const owner = await insertActor(database, orgId, "owner");
    const response = await call(app, owner.cookie, "post", "/members/invitations", {
      email: "nouvelle@example.test",
      role: "designer",
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(await count(database, "invitations", "organization_id = $1", [orgId])).toBe(1);

    const jobs = await boss.fetch<Record<string, string>>(SEND_INVITATION_QUEUE, { batchSize: 5 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data).toEqual({
      email: "nouvelle@example.test",
      url: `http://localhost:3000/accept-invitation/${response.body.id}`,
      inviterName: owner.name,
      organizationName: "enfilage",
      role: "designer",
    });
  });

  it("un refus (403) ou un conflit (409) n'enfile aucun job", async () => {
    const orgId = await insertOrganization(database, "sans-job");
    const owner = await insertActor(database, orgId, "owner");
    const dev = await insertActor(database, orgId, "dev");
    await call(app, owner.cookie, "post", "/members/invitations", {
      email: "u@example.test",
      role: "dev",
    });
    await boss.fetch(SEND_INVITATION_QUEUE, { batchSize: 5 });
    expect(
      (
        await call(app, dev.cookie, "post", "/members/invitations", {
          email: "v@example.test",
          role: "dev",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(app, owner.cookie, "post", "/members/invitations", {
          email: "u@example.test",
          role: "dev",
        })
      ).status,
    ).toBe(409);
    expect(await boss.fetch(SEND_INVITATION_QUEUE, { batchSize: 5 })).toHaveLength(0);
  });
});
