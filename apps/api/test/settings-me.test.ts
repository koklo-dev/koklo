import { NOTIFICATION_PREFERENCE_KEYS } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { type ClientScene, createClientScene } from "./helpers/client-scene.ts";
import { auditOf } from "./helpers/project-client.ts";
import { settingsApi } from "./helpers/settings.ts";

/** TK-97 (cas 10, et clés du cas 9) : `me.*` ouvert à toute session, jamais l'e-mail, préférences par clé fermée. */
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

const TEAM_KEYS = [
  "client_validation",
  "pr_to_review",
  "agent_silent",
  "ai_budget",
  "weekly_digest",
];
const CLIENT_KEYS = ["deliverable_to_validate", "feature_ready", "comment_reply"];

describe("me.get et me.update", () => {
  it.each([
    ["owner", () => scene.staff.owner],
    ["dev", () => scene.staff.dev],
    ["business", () => scene.staff.business],
    ["client", () => scene.c1],
    ["client sans lien", () => scene.c3],
  ] as const)("%s : lit son profil (nom, e-mail, rôle)", async (_label, actor) => {
    const res = await settingsApi(app, actor()).me();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      id: actor().userId,
      name: actor().name,
      email: actor().email,
      role: actor().role,
    });
  });

  it("sans session : 401", async () => {
    expect((await settingsApi(app, undefined).me()).status).toBe(401);
  });

  it("met à jour le nom (même un client), une entrée d'audit me.update, e-mail intact", async () => {
    const before = (await auditOf(database, scene.organizationId, ["me.update"])).length;
    const res = await settingsApi(app, scene.c1).meUpdate({
      name: "  Alice Client  ",
      email: "pirate@example.test",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ name: "Alice Client", email: scene.c1.email });
    const [row] = await database.query<{ name: string; email: string }>(
      "SELECT name, email FROM users WHERE id = $1",
      [scene.c1.userId],
    );
    expect(row).toEqual({ name: "Alice Client", email: scene.c1.email });
    const entries = await auditOf(database, scene.organizationId, ["me.update"]);
    expect(entries.length - before).toBe(1);
    expect(entries.at(-1)).toMatchObject({ target_kind: "user", target_id: scene.c1.userId });
  });

  it("nom vide, blanc ou de plus de 80 caractères : 422, rien n'est écrit", async () => {
    for (const name of ["", "   ", "x".repeat(81)]) {
      const res = await settingsApi(app, scene.staff.dev).meUpdate({ name });
      expect(res.status, name).toBe(422);
    }
    const [row] = await database.query<{ name: string }>("SELECT name FROM users WHERE id = $1", [
      scene.staff.dev.userId,
    ]);
    expect(row?.name).toBe(scene.staff.dev.name);
  });

  it("ne touche que le compte de la session", async () => {
    await settingsApi(app, scene.staff.admin).meUpdate({ name: "Admin Renommé" });
    const [other] = await database.query<{ name: string }>("SELECT name FROM users WHERE id = $1", [
      scene.staff.owner.userId,
    ]);
    expect(other?.name).toBe(scene.staff.owner.name);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("me.getNotifications et me.updateNotification", () => {
  it("par défaut (aucune ligne) : cinq clés d'équipe, tout activé sauf le résumé de la semaine", async () => {
    const res = await settingsApi(app, scene.staff.designer).notifications();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.map((item: { key: string }) => item.key)).toEqual(TEAM_KEYS);
    expect(
      Object.fromEntries(
        res.body.map((i: { key: string; enabled: boolean }) => [i.key, i.enabled]),
      ),
    ).toEqual({
      client_validation: true,
      pr_to_review: true,
      agent_silent: true,
      ai_budget: true,
      weekly_digest: false,
    });
  });

  it("client : ses trois clés, activées par défaut", async () => {
    const res = await settingsApi(app, scene.c1).notifications();
    expect(res.body.map((item: { key: string }) => item.key)).toEqual(CLIENT_KEYS);
    expect(res.body.every((item: { enabled: boolean }) => item.enabled)).toBe(true);
  });

  it("enregistre une préférence (client compris), la relit, une entrée d'audit par appel", async () => {
    const api = settingsApi(app, scene.c1);
    const before = (await auditOf(database, scene.organizationId, ["me.notifications.update"]))
      .length;
    const off = await api.setNotification("comment_reply", false);
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    expect(off.body).toEqual({ key: "comment_reply", enabled: false });
    expect(
      (await api.notifications()).body.find((i: { key: string }) => i.key === "comment_reply")
        .enabled,
    ).toBe(false);
    await api.setNotification("comment_reply", true);
    const rows = await database.query(
      "SELECT 1 FROM notification_preferences WHERE user_id = $1 AND organization_id = $2 AND key = 'comment_reply'",
      [scene.c1.userId, scene.organizationId],
    );
    expect(rows).toHaveLength(1);
    expect(
      (await auditOf(database, scene.organizationId, ["me.notifications.update"])).length - before,
    ).toBe(2);
  });

  it("propre à l'utilisateur : la préférence d'un membre ne change pas celle d'un autre", async () => {
    await settingsApi(app, scene.staff.dev).setNotification("weekly_digest", true);
    const other = await settingsApi(app, scene.staff.designer).notifications();
    expect(other.body.find((i: { key: string }) => i.key === "weekly_digest").enabled).toBe(false);
  });

  it("clé inconnue ou valeur non booléenne : 422, rien n'est écrit", async () => {
    const api = settingsApi(app, scene.staff.dev);
    expect((await api.setNotification("inconnue", true)).status).toBe(422);
    expect((await api.setNotification("pr_to_review", "oui")).status).toBe(422);
    expect(
      await database.query("SELECT 1 FROM notification_preferences WHERE key = 'inconnue'"),
    ).toHaveLength(0);
  });

  it("sans session : 401", async () => {
    expect((await settingsApi(app, undefined).notifications()).status).toBe(401);
    expect((await settingsApi(app, undefined).setNotification("pr_to_review", false)).status).toBe(
      401,
    );
  });

  it("la liste du contrat est exactement le CHECK de la base", async () => {
    const [row] = await database.query<{ def: string }>(
      "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'notification_preferences_key_check'",
    );
    const inBase = [...(row?.def.matchAll(/'([a-z_]+)'/g) ?? [])].map((match) => match[1]).sort();
    expect(inBase).toEqual([...NOTIFICATION_PREFERENCE_KEYS].sort());
  });
});
