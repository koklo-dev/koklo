import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { count } from "./helpers/organizations.ts";
import { auditOf } from "./helpers/project-client.ts";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createSuggestionScene,
  type SuggestionScene,
  suggestionApi,
  suggestionRows,
} from "./helpers/suggestions.ts";

/**
 * TK-55c : `suggestion.withdraw`. L'auteur seul retire sa suggestion ouverte ; le non-auteur reçoit
 * un 404 (on ne révèle pas l'existence d'une suggestion d'autrui) ; rejouer sur une suggestion déjà
 * retirée est un 200 idempotent ; une suggestion décidée est un 409 `suggestion_not_open`.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: SuggestionScene;
beforeEach(async () => {
  scene = await createSuggestionScene(bench());
});

const p1 = () => scene.p1.projectId;
const client = () => suggestionApi(bench().app, scene.c1);
const owner = () => suggestionApi(bench().app, scene.p1.world.actors.owner);
const dev = () => suggestionApi(bench().app, scene.p1.world.actors.dev);
const withdrawals = () =>
  auditOf(bench().database, scene.p1.organizationId, ["suggestion.withdraw"]);

async function mine() {
  const res = await client().create(p1(), { body: "À retirer" });
  return res.body.id as string;
}

describe("retrait par l'auteur", () => {
  it("open -> withdrawn : decided_at posé, aucun décideur, corps de réponse à jour", async () => {
    const id = await mine();

    const res = await client().withdraw(p1(), id);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ id, status: "withdrawn", mine: true, decisionNote: null });
    expect(res.body.decidedAt).toEqual(expect.any(String));
    const [row] = await suggestionRows(bench().database, p1());
    expect(row?.status).toBe("withdrawn");
    expect(row?.decided_at).not.toBeNull();
    expect(row?.decided_by_user_id).toBeNull();
    expect(row?.body).toBe("À retirer");
  });

  it("un membre de l'équipe retire la sienne", async () => {
    const created = await dev().create(p1());

    const res = await dev().withdraw(p1(), created.body.id);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("withdrawn");
  });

  it("une entrée d'audit suggestion.withdraw, cible = id de la ligne, sans contenu", async () => {
    const id = await mine();

    await client().withdraw(p1(), id);

    expect(await withdrawals()).toEqual([
      expect.objectContaining({
        action: "suggestion.withdraw",
        target_kind: "suggestion",
        target_id: id,
        actor_id: scene.c1.userId,
        ticket_id: null,
      }),
    ]);
  });
});

describe("non-auteur : 404 uniforme", () => {
  it.each([
    ["le propriétaire", () => owner()],
    ["un développeur", () => dev()],
    ["un client lié à un autre projet", () => suggestionApi(bench().app, scene.c2)],
  ])("%s ne retire pas la suggestion d'un client", async (_label, actor) => {
    const id = await mine();

    const res = await actor().withdraw(p1(), id);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect((await suggestionRows(bench().database, p1()))[0]?.status).toBe("open");
    expect(await withdrawals()).toHaveLength(0);
  });

  it("identifiant inconnu : même 404 que pour une suggestion d'autrui", async () => {
    const id = await mine();
    const other = await owner().withdraw(p1(), id);
    const unknown = await owner().withdraw(p1(), "11111111-1111-4111-8111-111111111111");

    expect(unknown.status).toBe(other.status);
    expect(unknown.body.code).toBe(other.body.code);
    expect(unknown.body.message).toBe(other.body.message);
  });
});

describe("rejeu et états", () => {
  it("rejeu sur une suggestion déjà retirée : 200 idempotent, aucune entrée d'audit en plus", async () => {
    const id = await mine();
    await client().withdraw(p1(), id);
    const before = await withdrawals();
    const notifications = await count(bench().database, "notifications");

    const again = await client().withdraw(p1(), id);

    expect(again.status).toBe(200);
    expect(again.body.status).toBe("withdrawn");
    expect(await withdrawals()).toHaveLength(before.length);
    expect(await count(bench().database, "notifications")).toBe(notifications);
  });

  it.each(["accept", "reject"] as const)(
    "suggestion déjà décidée (%s) : 409 suggestion_not_open, état inchangé",
    async (action) => {
      const id = await mine();
      await owner()[action](p1(), id);

      const res = await client().withdraw(p1(), id);

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: "CONFLICT", data: { reason: "suggestion_not_open" } });
      expect((await suggestionRows(bench().database, p1()))[0]?.status).toBe(
        action === "accept" ? "accepted" : "rejected",
      );
    },
  );

  it("une suggestion retirée ne compte plus dans le quota et peut être redéposée", async () => {
    const id = await mine();
    await client().withdraw(p1(), id);

    const again = await client().create(p1(), { body: "À retirer" });

    expect(again.status).toBe(200);
    expect(again.body.id).not.toBe(id);
  });
});
