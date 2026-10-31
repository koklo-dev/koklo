import { GitNotFoundError, WEBHOOK_DELIVERY_QUEUE } from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { featureMd, featurePath } from "./support/spec-files.ts";
import { sleep, WebhookBench, type WebhookScene } from "./support/webhook-bench.ts";

/**
 * TK-45b §5.3 et §8.2 : ordre des livraisons, force-push, suppression de branche, refs et dépôts
 * qui ne portent pas d'index, clé de sérialisation `push:<repo>:<ref>` (key_strict_fifo).
 */
let bench: WebhookBench;
let scene: WebhookScene;

const feature = (n: number) => ({
  [featurePath(`F-00${n}`, "x")]: featureMd(`F-00${n}`, `Feature ${n}`, { criteria: ["Un"] }),
});

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

describe("livraisons dans le désordre", () => {
  it("B puis A : la tête indexée est celle de B, la livraison A ne lit ni n'écrit rien", async () => {
    const a = await bench.commit(scene, feature(1));
    const b = await bench.commit(scene, feature(2));

    await bench.push(scene, { after: b });
    const reads = bench.spy.callsOf("readFile").length;
    const late = await bench.push(scene, { after: a });

    expect(late.status).toBe("processed");
    expect(await bench.headSha(scene)).toBe(b);
    expect((await bench.snapshots(scene)).map((row) => row.commit_sha)).toEqual([b]);
    expect(bench.spy.callsOf("readFile")).toHaveLength(reads);
  });

  it("une livraison ancienne rejouée après le progrès de la branche ne fait pas régresser l'index", async () => {
    const a = await bench.commit(scene, feature(1));
    await bench.push(scene, { after: a });
    const b = await bench.commit(scene, feature(2));
    await bench.push(scene, { after: b });

    await bench.push(scene, { after: a });

    expect(await bench.headSha(scene)).toBe(b);
    expect(await bench.snapshots(scene)).toHaveLength(2);
  });
});

describe("force-push et suppression", () => {
  it("force-push vers un commit d'une autre lignée : la tête suit la branche", async () => {
    await bench.push(scene, { after: await bench.commit(scene, feature(1)) });
    const other = await bench.commit(scene, feature(3), "alt", "main");
    bench.repoints.set("cadrage", other);

    await bench.push(scene, { after: other, forced: true });

    expect(await bench.headSha(scene)).toBe(other);
    const rows = await bench.snapshots(scene);
    expect(rows.map((row) => row.commit_sha)).toContain(other);
    const last = rows.find((row) => row.commit_sha === other);
    expect(await bench.featureIds(last?.id ?? "")).toContain("F-003");
  });

  it("force-push revenant à un commit déjà indexé : la tête recule, sans nouveau snapshot", async () => {
    const a = await bench.commit(scene, feature(1));
    await bench.push(scene, { after: a });
    await bench.push(scene, { after: await bench.commit(scene, feature(2)) });
    bench.repoints.set("cadrage", a);

    await bench.push(scene, { after: a, forced: true });

    expect(await bench.headSha(scene)).toBe(a);
    expect(await bench.snapshots(scene)).toHaveLength(2);
  });
});

describe("suppression de branche", () => {
  it("branche supprimée (deleted: true) : spec_heads retiré, snapshots conservés", async () => {
    await bench.push(scene, { after: await bench.commit(scene, feature(1)) });

    const row = await bench.push(scene, { deleted: true });

    expect(row.status).toBe("processed");
    expect(await bench.headSha(scene)).toBeUndefined();
    expect(await bench.snapshots(scene)).toHaveLength(1);
  });

  it("branche introuvable à la lecture (ref absente) : spec_heads retiré, livraison processed", async () => {
    await bench.push(scene, { after: await bench.commit(scene, feature(1)) });
    const error = new GitNotFoundError({
      operation: "listFiles",
      resource: "ref",
      identifier: "x",
    });
    bench.spy.failWith("listFiles", error);

    const row = await bench.push(scene, {});

    expect(row).toMatchObject({ status: "processed", error_code: null });
    expect(await bench.headSha(scene)).toBeUndefined();
  });

  it("suppression d'une branche jamais indexée : processed, sans erreur", async () => {
    const row = await bench.push(scene, {
      branch: "jamais",
      ref: "refs/heads/jamais",
      deleted: true,
    });
    expect(row).toMatchObject({ status: "processed", error_code: null });
  });
});

describe("branches et refs", () => {
  it("toute branche d'un dépôt de spec est indexée sous son propre pointeur, sans toucher les autres", async () => {
    await bench.push(scene, { after: await bench.commit(scene, feature(1)) });
    const before = await bench.headSha(scene);
    const change = await bench.commit(scene, feature(2), "feat/x");

    await bench.push(scene, { branch: "feat/x", ref: "refs/heads/feat/x", after: change });

    expect(await bench.headSha(scene, "feat/x")).toBe(change);
    expect(await bench.headSha(scene)).toBe(before);
  });

  it("deux branches sur le même commit partagent un seul snapshot", async () => {
    const head = await bench.commit(scene, feature(1));
    const auth = await bench.spy.auth(scene.owner);
    await bench.spy.inner
      .createBranch({ auth, repo: scene.ref, base: head, name: "feat/z" })
      .catch(() => undefined);

    await bench.push(scene, { after: head });
    await bench.push(scene, { branch: "feat/z", ref: "refs/heads/feat/z", after: head });

    expect(await bench.headSha(scene, "feat/z")).toBe(head);
    expect(await bench.snapshots(scene)).toHaveLength(1);
  });

  it("un tag (branch: null) est ignoré sans appel au fournisseur", async () => {
    const row = await bench.push(scene, { branch: null });
    expect(row.status).toBe("ignored");
    expect(bench.spy.calls).toHaveLength(0);
    expect(await bench.snapshots(scene)).toEqual([]);
  });

  it("un nom de branche douteux (..) est ignoré avant tout appel au fournisseur", async () => {
    const row = await bench.push(scene, { branch: "a..b", ref: "refs/heads/a..b" });
    expect(row.status).toBe("ignored");
    expect(bench.spy.calls).toHaveLength(0);
  });
});

describe("dépôts et installations qui n'ont pas d'index", () => {
  it("un dépôt de code (rôle front, sans spec_path) est ignoré, sans erreur ni appel", async () => {
    await bench.query("UPDATE project_repos SET role = 'front', spec_path = NULL WHERE id = $1", [
      scene.repoId,
    ]);
    const row = await bench.push(scene);
    expect(row).toMatchObject({ status: "ignored", error_code: null });
    expect(bench.spy.calls).toHaveLength(0);
    expect(await bench.snapshots(scene)).toEqual([]);
  });

  it.each(["suspended", "deleted"])(
    "installation %s : push ignoré, aucun appel",
    async (status) => {
      await bench.query(
        "UPDATE provider_installations SET status = $2::installation_status WHERE id = $1",
        [scene.installationId, status],
      );
      const row = await bench.push(scene);
      expect(row.status).toBe("ignored");
      expect(bench.spy.calls).toHaveLength(0);
    },
  );
});

describe("clé de sérialisation", () => {
  it("le job porte la clé push:<dépôt>:<ref> dans une file key_strict_fifo", async () => {
    const id = await bench.deliver(bench.pushPayload(scene));
    await bench.settled(id);

    const job = await bench.worker.boss.getJobById(WEBHOOK_DELIVERY_QUEUE, id);
    const queue = await bench.worker.boss.getQueue(WEBHOOK_DELIVERY_QUEUE);

    expect(job?.singletonKey).toBe(`push:${scene.repoExternalId}:refs/heads/cadrage`);
    expect(queue?.policy).toBe("key_strict_fifo");
  });

  it("trois pushes de la même branche ne s'exécutent jamais en parallèle", async () => {
    await bench.commit(scene, feature(1));
    let running = 0;
    let max = 0;
    bench.spy.hooks.set("listFiles", async () => {
      running += 1;
      max = Math.max(max, running);
      await sleep(400);
      running -= 1;
    });

    const ids = await Promise.all([1, 2, 3].map(() => bench.deliver(bench.pushPayload(scene))));
    await Promise.all(ids.map((id) => bench.settled(id)));

    expect(max).toBe(1);
  });
});
