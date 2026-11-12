import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { overviewApi } from "./helpers/overview.ts";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createNoClientScene,
  createReviewScene,
  P1_FEATURES,
  type ReviewScene,
  reminderRows,
  reviewApi,
} from "./helpers/reviews.ts";
import { seedIndex } from "./helpers/spec-read.ts";

/**
 * TK-104 lot A (B352) : `review.remind`, relance du client. Owner et admin seulement (403 sinon), 409 `no_client` sans
 * client invité, une notification `review.reminded` par client et par jour (rejeu sans doublon), audit `review.remind` et
 * ligne d'activité « a relancé <prénom> » pour l'équipe, jamais pour le client.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
const p1 = () => scene.p1.projectId;
const as = (role: "owner" | "admin" | "dev" | "designer" | "business" | "client") =>
  reviewApi(bench().app, scene.p1.world.actors[role]);
const auditRows = () =>
  bench().database.query<{ target_kind: string; actor_id: string }>(
    "SELECT target_kind, actor_id FROM audit_log WHERE action = 'review.remind' AND project_id = $1",
    [p1()],
  );

beforeEach(async () => {
  scene = await createReviewScene(bench());
  await seedIndex(bench(), scene.p1, P1_FEATURES, { commit: true });
});

describe("droits (D1, B352)", () => {
  it.each(["owner", "admin"] as const)("%s relance les clients liés : 200", async (role) => {
    const res = await as(role).remind(p1());
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ reminded: 2 });
  });

  it.each(["dev", "designer", "business", "client"] as const)(
    "%s : 403, aucune notification ni audit",
    async (role) => {
      const res = await as(role).remind(p1());
      expect(res.status).toBe(403);
      expect(await reminderRows(bench().database, scene.p1.organizationId)).toHaveLength(0);
      expect(await auditRows()).toHaveLength(0);
    },
  );

  it("sans session : 401 ; un client d'un autre projet : 403 ; l'owner d'une autre organisation : 404", async () => {
    expect((await reviewApi(bench().app, undefined).remind(p1())).status).toBe(401);
    expect((await reviewApi(bench().app, scene.c2).remind(p1())).status).toBe(403);
    const foreign = reviewApi(bench().app, scene.foreign.world.actors.owner);
    expect((await foreign.remind(p1())).status).toBe(404);
  });

  it("sans client invité : 409 no_client, rien d'écrit", async () => {
    const bare = await createNoClientScene(bench(), scene);
    const res = await as("owner").remind(bare.projectId);
    expect(res.status).toBe(409);
    expect(res.body.data).toEqual({ reason: "no_client" });
    expect(await reminderRows(bench().database, scene.p1.organizationId)).toHaveLength(0);
  });
});

describe("notification, audit et activité", () => {
  it("une notification par client lié, sur le sujet review, clé datée du jour", async () => {
    await as("owner").remind(p1());

    const rows = await reminderRows(bench().database, scene.p1.organizationId);
    expect(rows.map((row) => row.recipient_user_id).sort()).toEqual(
      [scene.c1.userId, scene.c4.userId].sort(),
    );
    const day = new Date().toISOString().slice(0, 10);
    for (const row of rows) {
      expect(row.subject_kind).toBe("review");
      expect(row.dedupe_key).toMatch(
        new RegExp(`^review\\.reminded:${p1()}:[0-9a-f-]{36}:${day}$`),
      );
    }
  });

  it("rejeu le même jour : reminded 0, aucun doublon de notification ni d'audit", async () => {
    await as("owner").remind(p1());
    const audits = (await auditRows()).length;

    const again = await as("admin").remind(p1());

    expect(again.status).toBe(200);
    expect(again.body).toEqual({ reminded: 0 });
    expect(await reminderRows(bench().database, scene.p1.organizationId)).toHaveLength(2);
    expect(await auditRows()).toHaveLength(audits);
  });

  it("audit review.remind par client relancé, acteur = l'auteur de la relance, aucune donnée libre", async () => {
    await as("owner").remind(p1());

    const rows = await auditRows();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.target_kind).toBe("project_client");
      expect(row.actor_id).toBe(scene.p1.world.actors.owner.userId);
    }
  });

  it("l'activité de la vue d'ensemble dit « a relancé » à l'équipe, jamais au client", async () => {
    await as("owner").remind(p1());

    const team = await overviewApi(bench().app, scene.p1.world.actors.admin).activity(p1());
    const texts = (team.body.items as { text: string }[]).map((item) => item.text);
    expect(texts).toContain(`${scene.p1.world.actors.owner.name} a relancé Nom`);
    const client = await overviewApi(bench().app, scene.c1).activity(p1());
    expect(
      (client.body.items as { text: string }[]).map((item) => item.text).join("\n"),
    ).not.toContain("relancé");
  });
});
