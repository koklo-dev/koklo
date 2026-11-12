import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ago, insertReviewAt } from "./helpers/deliverable-reviews.ts";
import { freezeIdea } from "./helpers/proposals.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { deliverablesApi } from "./helpers/spec-deliverables.ts";
import { readScene } from "./helpers/spec-read.ts";
import { linkClient, type World } from "./helpers/tickets.ts";

/**
 * TK-100 lot C (B328) : impact amont. `idea-v2` figée après `idea-v1` rend « À revoir » (avec `staleBecause`) les livrables
 * dépendants dont la dernière validation est antérieure ; un livrable jamais validé n'est pas touché ; une validation
 * postérieure à la nouvelle version l'efface ; le forçage ne masque rien.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
const V1 = { vision: 1, personas: 1 };
const V2 = { vision: 2, personas: 1, risques: 1 };

type Entry = {
  key: string;
  status: string;
  forced: boolean;
  available: boolean;
  staleBecause?: { idea: string; changedPages: number };
};
const entriesOf = async (world: World, role: keyof World["actors"] = "dev") => {
  const res = await deliverablesApi(bench().app, world.actors[role]).list(world.projectId);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return Object.fromEntries(res.body.deliverables.map((e: Entry) => [e.key, e])) as Record<
    string,
    Entry
  >;
};

async function sceneWithV1() {
  const scene = await readScene(bench());
  await freezeIdea(bench().database, scene, 1, V1, ago(3));
  return scene;
}
const validate = (scene: Awaited<ReturnType<typeof sceneWithV1>>, key: string, at: Date) =>
  insertReviewAt(bench().database, scene, scene.world.actors.owner.userId, at, {
    kind: "deliverable",
    ref: key,
  });

describe("impact amont d'idea-vN+1", () => {
  it("Fonctionnel et Données validés avant idea-v2 : « À revoir » avec staleBecause (deux pages changées)", async () => {
    const scene = await sceneWithV1();
    await validate(scene, "functional", ago(2));
    await validate(scene, "data", ago(2));
    await freezeIdea(bench().database, scene, 2, V2, ago(1));

    const entries = await entriesOf(scene.world);
    expect(entries.functional).toMatchObject({
      status: "revise",
      staleBecause: { idea: "idea-v2", changedPages: 2 },
    });
    expect(entries.data).toMatchObject({
      status: "revise",
      staleBecause: { idea: "idea-v2", changedPages: 2 },
    });
  });

  it("un livrable jamais validé n'est pas touché : ni « À revoir » ni staleBecause", async () => {
    const scene = await sceneWithV1();
    await validate(scene, "functional", ago(2));
    await freezeIdea(bench().database, scene, 2, V2, ago(1));

    const entries = await entriesOf(scene.world);
    expect(entries.data?.status).toBe("todo");
    expect(entries.data?.staleBecause).toBeUndefined();
    expect(entries.architecture?.staleBecause).toBeUndefined();
  });

  it("validation postérieure à idea-v2 : plus de staleBecause", async () => {
    const scene = await sceneWithV1();
    await validate(scene, "functional", ago(2));
    await freezeIdea(bench().database, scene, 2, V2, ago(1));
    await validate(scene, "functional", new Date());

    const entries = await entriesOf(scene.world);
    expect(entries.functional?.staleBecause).toBeUndefined();
    expect(entries.functional?.status).not.toBe("revise");
  });
});

describe("cas limites de l'impact amont", () => {
  it("une seule version d'idée, ou deux versions sans page changée : rien n'est périmé", async () => {
    const scene = await sceneWithV1();
    await validate(scene, "functional", ago(2));
    expect((await entriesOf(scene.world)).functional?.staleBecause).toBeUndefined();
    await freezeIdea(bench().database, scene, 2, V1, ago(1));
    expect((await entriesOf(scene.world)).functional?.staleBecause).toBeUndefined();
  });

  it("une validation d'élément du Fonctionnel compte comme validation du Fonctionnel", async () => {
    const scene = await sceneWithV1();
    await insertReviewAt(
      bench().database,
      scene,
      scene.world.actors.owner.userId,
      ago(2),
      { kind: "feature", ref: "F-001" },
      "changes_requested",
    );
    await freezeIdea(bench().database, scene, 2, V2, ago(1));
    expect((await entriesOf(scene.world)).functional?.staleBecause).toMatchObject({
      idea: "idea-v2",
    });
  });

  it("le forçage ne masque pas : livrable forcé et périmé reste « À revoir », forcé, ouvert", async () => {
    const scene = await sceneWithV1();
    await validate(scene, "architecture", ago(2));
    await deliverablesApi(bench().app, scene.world.actors.owner).force(
      scene.world.projectId,
      "architecture",
    );
    await freezeIdea(bench().database, scene, 2, V2, ago(1));

    const entries = await entriesOf(scene.world);
    expect(entries.architecture).toMatchObject({
      status: "revise",
      forced: true,
      available: true,
      staleBecause: { idea: "idea-v2", changedPages: 2 },
    });
  });

  it("le client reçoit aussi staleBecause, sans proposition", async () => {
    const scene = await sceneWithV1();
    await validate(scene, "functional", ago(2));
    await freezeIdea(bench().database, scene, 2, V2, ago(1));
    const { world } = scene;
    await linkClient(
      bench().database,
      world.organizationId,
      world.projectId,
      world.actors.client.userId,
    );
    const entries = await entriesOf(world, "client");
    expect(entries.functional?.staleBecause?.idea).toBe("idea-v2");
  });
});
