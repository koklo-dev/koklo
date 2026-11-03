import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertActor } from "./helpers/organizations.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { moveHead, seedIndex } from "./helpers/spec-read.ts";
import {
  createSuggestionScene,
  type SuggestionScene,
  suggestionApi,
} from "./helpers/suggestions.ts";
import { linkClient } from "./helpers/tickets.ts";

/**
 * TK-55c : `suggestion.list`. Un client lié voit toutes les suggestions de son projet (un projet = un
 * client) mais ni identité d'auteur ni SHA : `mine` et `outdated` suffisent ; l'équipe reçoit en
 * plus `authorRole`. Plus récentes d'abord, pagination bornée, filtres fermés.
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
const IDENTITY_KEYS = [
  "authorUserId",
  "authorId",
  "userId",
  "email",
  "name",
  "baseSha",
  "base_sha",
];

async function seed() {
  const a = await client().createFeature(p1(), "F-001", { body: "A du client" });
  const b = await dev().create(p1(), { body: "B de l'équipe" });
  const c = await client().createFeature(p1(), "F-002", { body: "C du client" });
  return [a.body.id, b.body.id, c.body.id] as string[];
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("contenu des éléments", () => {
  it("client : clés exactes sans authorRole, mine vrai pour les siennes seulement", async () => {
    await seed();

    const res = await client().list(p1());

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const items = res.body.items as Record<string, unknown>[];
    expect(items.map((item) => item.body)).toEqual(["C du client", "B de l'équipe", "A du client"]);
    expect(items.map((item) => item.mine)).toEqual([true, false, true]);
    for (const item of items) {
      expect(Object.keys(item)).not.toContain("authorRole");
      for (const key of IDENTITY_KEYS) expect(Object.keys(item), key).not.toContain(key);
    }
    expect(res.body.nextCursor).toBeNull();
  });

  it("équipe : authorRole en plus, mine propre à l'appelant, jamais d'identité", async () => {
    await seed();

    const res = await dev().list(p1());

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const items = res.body.items as Record<string, unknown>[];
    expect(items.map((item) => item.authorRole)).toEqual(["client", "dev", "client"]);
    expect(items.map((item) => item.mine)).toEqual([false, true, false]);
    for (const item of items) {
      for (const key of IDENTITY_KEYS) expect(Object.keys(item), key).not.toContain(key);
    }
  });

  it("un second client lié au même projet voit les suggestions du premier avec mine faux", async () => {
    await seed();
    const second = await insertActor(
      bench().database,
      scene.p1.organizationId,
      "client",
      "client4",
    );
    await linkClient(bench().database, scene.p1.organizationId, p1(), second.userId);

    const res = await suggestionApi(bench().app, second).list(p1());

    const items = res.body.items as { mine: boolean }[];
    expect(items).toHaveLength(3);
    expect(items.every((item) => item.mine === false)).toBe(true);
  });

  it("aucune suggestion d'un autre projet", async () => {
    await seed();
    await suggestionApi(bench().app, scene.c2).create(scene.p2.projectId, { body: "SECRET-P2" });

    const res = await client().list(p1());

    expect(JSON.stringify(res.body)).not.toContain("SECRET-P2");
    expect(res.body.items).toHaveLength(3);
  });

  it("outdated : faux sur la tête courante, vrai quand la spec a avancé, sans SHA exposé", async () => {
    const [first] = await seed();
    const moved = await seedIndex(bench(), scene.p1, [{ id: "F-001", titre: "Connexion v2" }], {
      commit: true,
      noHead: true,
    });
    const beforeRes = await client().list(p1());
    expect(beforeRes.status, JSON.stringify(beforeRes.body)).toBe(200);
    const before = beforeRes.body.items as { id: string; outdated: boolean }[];
    await moveHead(bench().database, scene.p1, "cadrage", moved.snapshotId);

    const after = await client().list(p1());

    expect(after.status, JSON.stringify(after.body)).toBe(200);
    expect(before.every((item) => item.outdated === false)).toBe(true);
    const items = after.body.items as { id: string; outdated: boolean }[];
    expect(items.find((item) => item.id === first)?.outdated).toBe(true);
    expect(JSON.stringify(after.body)).not.toMatch(/[0-9a-f]{40}/);
    const fresh = await client().create(p1(), { body: "Après l'avance" });
    expect(fresh.body.outdated).toBe(false);
  });
});

describe("filtres et pagination", () => {
  it("status et targetRef filtrent", async () => {
    const [a, b] = await seed();
    await owner().accept(p1(), a as string);
    await dev().withdraw(p1(), b as string);

    const byStatus = async (status: string) => {
      const res = await owner().list(p1(), `?status=${status}`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      return (res.body.items as { id: string }[]).map((i) => i.id);
    };

    expect(await byStatus("accepted")).toEqual([a]);
    expect(await byStatus("withdrawn")).toEqual([b]);
    expect(await byStatus("open")).toHaveLength(1);
    const byRef = await owner().list(p1(), "?targetRef=F-002");
    expect(byRef.status).toBe(200);
    expect((byRef.body.items as { targetRef: string }[]).map((item) => item.targetRef)).toEqual([
      "F-002",
    ]);
  });

  it("limit et cursor : pages disjointes, ordre conservé, curseur nul à la fin", async () => {
    for (let n = 1; n <= 5; n++) await client().create(p1(), { body: `idée ${n}` });
    const seen: string[] = [];

    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await client().list(p1(), query);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.items.length).toBeLessThanOrEqual(2);
      seen.push(...res.body.items.map((item: { key: string }) => item.key));
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);

    expect(seen).toEqual(["SG-5", "SG-4", "SG-3", "SG-2", "SG-1"]);
    expect(pages).toBe(3);
  });

  it.each([
    "?limit=0",
    "?limit=101",
    "?status=pending",
    "?limit=abc",
    `?targetRef=${"x".repeat(65)}`,
  ])("entrée invalide %s : 422 VALIDATION", async (query) => {
    const res = await client().list(p1(), query);

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
  });
});
