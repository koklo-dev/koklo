import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createSuggestionScene,
  type NotificationRow,
  notificationRows,
  type SuggestionScene,
  suggestionApi,
} from "./helpers/suggestions.ts";

/**
 * TK-55c : notifications émises (lignes `notifications`, sans envoi d'e-mail) par un émetteur unique,
 * dans la transaction de l'événement. `suggestion.created` : owner, admin, dev hors auteur ;
 * `suggestion.decided` : l'auteur s'il est encore membre (et lié, s'il est client). La `dedupe_key`
 * contient le projet, la contrainte d'unicité n'en portant pas. Aucun contenu dans les lignes.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: SuggestionScene;
beforeEach(async () => {
  scene = await createSuggestionScene(bench());
});

const actors = () => scene.p1.world.actors;
const as = (actor: { cookie: string }) => suggestionApi(bench().app, actor);
const p1 = () => scene.p1.projectId;
const all = () => notificationRows(bench().database, scene.p1.organizationId);
const recipients = (rows: NotificationRow[]) => rows.map((row) => row.recipient_user_id).sort();
const ids = (...users: { userId: string }[]) => users.map((user) => user.userId).sort();

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("suggestion.created", () => {
  it("créée par un client : owner, admin et dev, ni le designer, ni le business, ni le client", async () => {
    const res = await as(scene.c1).create(p1(), { body: "Une idée" });

    const rows = await all();
    expect(res.status).toBe(200);
    expect(recipients(rows)).toEqual(ids(actors().owner, actors().admin, actors().dev));
    for (const row of rows) {
      expect(row).toMatchObject({
        type: "suggestion.created",
        project_id: p1(),
        subject_kind: "suggestion",
        subject_ref: "SG-1",
        dedupe_key: `suggestion.created:${p1()}:SG-1`,
        email_state: "pending",
      });
    }
  });

  it("créée par un dev : l'auteur n'est pas notifié de sa propre suggestion", async () => {
    await as(actors().dev).create(p1());

    expect(recipients(await all())).toEqual(ids(actors().owner, actors().admin));
  });

  it("deux projets, deux SG-1 : deux notifications distinctes par destinataire (clé avec projet)", async () => {
    await as(scene.c1).create(p1(), { body: "Dans p1" });
    await as(scene.c2).create(scene.p2.projectId, { body: "Dans p2" });

    const owner = (await all()).filter((row) => row.recipient_user_id === actors().owner.userId);
    expect(owner.map((row) => row.dedupe_key).sort()).toEqual(
      [`suggestion.created:${p1()}:SG-1`, `suggestion.created:${scene.p2.projectId}:SG-1`].sort(),
    );
    expect(owner.map((row) => row.project_id).sort()).toEqual([p1(), scene.p2.projectId].sort());
  });

  it("jamais de destinataire d'une autre organisation", async () => {
    expect((await as(scene.c1).create(p1())).status).toBe(200);
    expect((await all()).length, "précondition : des notifications existent").toBeGreaterThan(0);

    const foreign = await notificationRows(bench().database, scene.foreign.organizationId);
    expect(foreign).toEqual([]);
  });

  it("aucun contenu libre dans les lignes (ni corps, ni note)", async () => {
    await as(scene.c1).create(p1(), { body: "TEXTE-SENTINELLE-NOTIF" });

    expect((await all()).length, "précondition : des notifications existent").toBeGreaterThan(0);
    expect(JSON.stringify(await all())).not.toContain("SENTINELLE");
  });

  it("rejeu d'un doublon, création refusée ou invalide : aucune notification en plus", async () => {
    await as(scene.c1).create(p1(), { body: "Une idée" });
    const before = (await all()).length;
    expect(before, "précondition : des notifications existent").toBeGreaterThan(0);

    await as(scene.c1).create(p1(), { body: "Une idée" });
    await as(scene.c1).create(p1(), { body: "" });
    await as(scene.c1).createFeature(p1(), "F-999");
    await as(actors().business).create(p1());
    await as(scene.c3).create(p1());

    expect((await all()).length).toBe(before);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("suggestion.decided", () => {
  it.each([
    ["accept", "accepted"],
    ["reject", "rejected"],
  ] as const)(
    "%s : seul l'auteur client est notifié, clé avec projet et décision",
    async (action, status) => {
      const created = await as(scene.c1).create(p1());
      const before = (await all()).length;

      await as(actors().owner)[action](p1(), created.body.id);

      const rows = (await all()).slice(before);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        recipient_user_id: scene.c1.userId,
        type: "suggestion.decided",
        project_id: p1(),
        subject_kind: "suggestion",
        subject_ref: "SG-1",
        dedupe_key: `suggestion.decided:${p1()}:SG-1:${status}`,
      });
    },
  );

  it("l'auteur d'équipe est notifié de la décision d'un autre ; pas de notification à soi-même", async () => {
    const theirs = await as(actors().dev).create(p1(), { body: "Celle du dev" });
    const mine = await as(actors().owner).create(p1(), { body: "Celle du owner" });
    const before = (await all()).length;

    await as(actors().owner).accept(p1(), theirs.body.id);
    await as(actors().owner).accept(p1(), mine.body.id);

    const rows = (await all()).slice(before);
    expect(recipients(rows)).toEqual(ids(actors().dev));
  });

  it("rejeu de la même décision et retrait : aucune ligne en plus", async () => {
    const created = await as(scene.c1).create(p1());
    const second = await as(scene.c1).create(p1(), { body: "Deuxième" });
    await as(actors().owner).accept(p1(), created.body.id);
    const before = (await all()).length;
    expect(before, "précondition : la décision a notifié").toBeGreaterThan(1);

    await as(actors().dev).accept(p1(), created.body.id);
    await as(actors().dev).reject(p1(), created.body.id);
    await as(scene.c1).withdraw(p1(), second.body.id);

    expect((await all()).length).toBe(before);
  });

  it("auteur client dont le lien a été supprimé : décision 200, aucun destinataire", async () => {
    const created = await as(scene.c1).create(p1());
    await bench().database.query("DELETE FROM project_client_access WHERE user_id = $1", [
      scene.c1.userId,
    ]);
    const before = (await all()).length;

    const res = await as(actors().owner).accept(p1(), created.body.id);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await all()).length).toBe(before);
  });

  it("auteur qui a quitté l'organisation : décision 200, aucun destinataire, jamais d'erreur 500", async () => {
    const created = await as(actors().dev).create(p1());
    await bench().database.query("DELETE FROM members WHERE user_id = $1", [actors().dev.userId]);
    const before = (await all()).length;

    const res = await as(actors().owner).reject(p1(), created.body.id);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await all()).length).toBe(before);
  });
});

describe("atomicité avec l'événement", () => {
  it("échec d'audit à la décision : la suggestion reste ouverte, aucune notification de décision", async () => {
    const created = await as(scene.c1).create(p1());
    await bench().database.query("INSERT INTO audit_fail (action) VALUES ('suggestion.accept')");

    const res = await as(actors().owner).accept(p1(), created.body.id);

    expect(res.status).toBe(500);
    expect((await all()).filter((row) => row.type === "suggestion.decided")).toEqual([]);
    await bench().database.query("DELETE FROM audit_fail");
    expect((await as(actors().owner).accept(p1(), created.body.id)).status).toBe(200);
  });
});
