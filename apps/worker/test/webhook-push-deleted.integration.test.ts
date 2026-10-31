import { GitNotFoundError } from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { featureMd, featurePath } from "./support/spec-files.ts";
import { WebhookBench, type WebhookScene } from "./support/webhook-bench.ts";

/**
 * TK-45b (correction de review) : « l'ordre des livraisons est sans importance » vaut aussi pour la
 * suppression de branche. Une livraison `deleted` ne supprime jamais la tête sur la foi de la charge :
 * la branche est relue à l'exécution (absente : tête supprimée ; recréée entre-temps : tête
 * conservée et réalignée). Et un 404 « ref » du fournisseur réel ne distingue pas une branche
 * supprimée d'un dépôt perdu : le dépôt est vérifié avant d'effacer la tête (analyse §5.5).
 */
let bench: WebhookBench;
let scene: WebhookScene;

const feature = (n: number) => ({
  [featurePath(`F-00${n}`, "x")]: featureMd(`F-00${n}`, `Feature ${n}`, { criteria: ["Un"] }),
});
const missingRef = () =>
  new GitNotFoundError({ operation: "listFiles", resource: "ref", identifier: "r@cadrage" });
const missingRepository = () =>
  new GitNotFoundError({ operation: "getRepo", resource: "repository", identifier: "a/b" });

beforeAll(async () => {
  bench = await WebhookBench.create();
  await bench.start();
}, 240_000);
afterAll(async () => {
  await bench?.dispose();
});
beforeEach(async () => {
  bench.repoints.clear();
  scene = await bench.scene();
});

describe("suppression de branche et ordre des livraisons", () => {
  it("« supprimée » livrée après « recréée » : la branche existe à l'exécution, la tête reste et pointe la tête réelle", async () => {
    await bench.push(scene, { after: await bench.commit(scene, feature(1)) });
    const recreated = await bench.commit(scene, feature(2));

    const row = await bench.push(scene, { deleted: true });

    expect(row).toMatchObject({ status: "processed", error_code: null });
    expect(await bench.headSha(scene)).toBe(recreated);
  });

  it("branche réellement absente à l'exécution : tête supprimée, snapshots conservés, dépôt vérifié", async () => {
    await bench.push(scene, { after: await bench.commit(scene, feature(1)) });
    bench.spy.failWith("listFiles", missingRef());

    const row = await bench.push(scene, { deleted: true });

    expect(row).toMatchObject({ status: "processed", error_code: null });
    expect(await bench.headSha(scene)).toBeUndefined();
    expect(await bench.snapshots(scene)).toHaveLength(1);
    expect(bench.spy.callsOf("getRepo")).toHaveLength(1);
  });
});

describe("dépôt perdu (404 « ref » ambigu du fournisseur réel)", () => {
  it("listFiles 404 « ref » puis getRepo 404 : failed / repo_not_found, tête inchangée", async () => {
    await bench.push(scene, { after: await bench.commit(scene, feature(1)) });
    const before = await bench.headSha(scene);
    bench.spy.failWith("listFiles", missingRef());
    bench.spy.failWith("getRepo", missingRepository());

    const row = await bench.push(scene, {});

    expect(row).toMatchObject({ status: "failed", error_code: "repo_not_found" });
    expect(before).toBeDefined();
    expect(await bench.headSha(scene)).toBe(before);
  });

  it("même cas sur une livraison `deleted` : failed / repo_not_found, tête inchangée", async () => {
    await bench.push(scene, { after: await bench.commit(scene, feature(1)) });
    const before = await bench.headSha(scene);
    bench.spy.failWith("listFiles", missingRef());
    bench.spy.failWith("getRepo", missingRepository());

    const row = await bench.push(scene, { deleted: true });

    expect(row).toMatchObject({ status: "failed", error_code: "repo_not_found" });
    expect(await bench.headSha(scene)).toBe(before);
  });

  it("listFiles 404 « ref » et dépôt présent : la branche est bien supprimée, tête supprimée, processed", async () => {
    await bench.push(scene, { after: await bench.commit(scene, feature(1)) });
    bench.spy.failWith("listFiles", missingRef());

    const row = await bench.push(scene, {});

    expect(row).toMatchObject({ status: "processed", error_code: null });
    expect(await bench.headSha(scene)).toBeUndefined();
    expect(bench.spy.callsOf("getRepo")).toHaveLength(1);
  });
});
