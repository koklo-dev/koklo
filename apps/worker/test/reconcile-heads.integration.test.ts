import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetBench, runReconcile } from "./support/reconcile-bench.ts";
import {
  addCodeRepo,
  callsFor,
  clearRepos,
  failBranch,
  failFor,
  headAudit,
  missingRef,
  missingRepository,
  reconciledAt,
} from "./support/reconcile-heads-bench.ts";
import { featureMd, featurePath } from "./support/spec-files.ts";
import { WebhookBench, type WebhookScene } from "./support/webhook-bench.ts";

/**
 * TK-46c passe P4 : index des têtes de spec. La branche par défaut et les têtes connues sont
 * ré-indexées par `indexBranch` ; un push perdu est rattrapé (AC-10), une branche supprimée efface sa
 * tête après vérification du dépôt, un dépôt injoignable garde ses têtes et n'est signalé qu'une fois
 * (AC-9). L'audit n'est écrit que si l'état change, jamais à chaque tick.
 */
let bench: WebhookBench;
let scene: WebhookScene;

const feature = (n: number) => ({
  [featurePath(`F-00${n}`, "x")]: featureMd(`F-00${n}`, `Feature ${n}`, { criteria: ["Un"] }),
});
const audits = async (like?: string) => (await headAudit(bench, scene, like)).length;

beforeAll(async () => {
  bench = await WebhookBench.create();
  await bench.start();
}, 240_000);
afterAll(async () => {
  await bench?.dispose();
});
beforeEach(async () => {
  await resetBench(bench);
  await clearRepos(bench);
  scene = await bench.scene();
});

describe("reconcile-missed-push-reindexes-head", () => {
  it("push jamais livré : la tête est déplacée vers le nouveau commit, UN audit head_updated, système, cible = dépôt", async () => {
    await bench.push(scene, { after: await bench.commit(scene, feature(1)) });
    await runReconcile(bench);
    const baseline = await audits("repo.reconcile.head_updated");
    const moved = await bench.commit(scene, feature(2));

    const summary = await runReconcile(bench);

    expect(await bench.headSha(scene)).toBe(moved);
    expect(summary.heads).toMatchObject({ updated: 1, removed: 0, unreachable: 0, stopped: null });
    const rows = await headAudit(bench, scene, "repo.reconcile.head_updated");
    expect(rows).toHaveLength(baseline + 1);
    expect(rows.at(-1)).toMatchObject({
      actor_kind: "system",
      actor_id: null,
      target_kind: "repo",
      target_id: scene.repoId,
      organization_id: scene.organizationId,
    });
    expect(summary.failedPasses ?? []).toEqual([]);
  });

  it("tête inchangée : aucun audit, aucun fichier relu, bilan à zéro", async () => {
    await bench.push(scene, { after: await bench.commit(scene, feature(1)) });
    await runReconcile(bench);
    const baseline = await audits();
    bench.spy.reset();

    const summary = await runReconcile(bench);

    expect(await audits()).toBe(baseline);
    expect(summary.heads).toMatchObject({ updated: 0, removed: 0, unreachable: 0 });
    expect(callsFor(bench, scene, "readFile")).toEqual([]);
  });

  it("deux runs sans nouveau commit : le second n'ajoute aucune ligne d'audit", async () => {
    await bench.commit(scene, feature(1));
    await runReconcile(bench);
    const baseline = await audits();

    await runReconcile(bench);

    expect(await audits()).toBe(baseline);
  });
});

describe("reconcile-missed-push : branche par défaut et têtes connues", () => {
  it("la branche par défaut, sans tête connue, est indexée au premier run (tête créée = état changé)", async () => {
    expect(await bench.headSha(scene, "main")).toBeUndefined();

    const summary = await runReconcile(bench);

    expect(await bench.headSha(scene, "main")).toBe(await bench.head(scene, "main"));
    expect(summary.heads?.updated).toBeGreaterThanOrEqual(1);
    expect(await audits("repo.reconcile.head_updated")).toBeGreaterThanOrEqual(1);
  });

  it("une tête connue est réconciliée même si ce n'est pas la branche par défaut (un seul auth par run)", async () => {
    await bench.push(scene, { after: await bench.commit(scene, feature(1)) });
    const moved = await bench.commit(scene, feature(2));
    bench.spy.reset();

    await runReconcile(bench);

    expect(await bench.headSha(scene)).toBe(moved);
    expect(callsFor(bench, scene, "authenticate")).toHaveLength(1);
  });
});

describe("reconcile-deleted-branch-removes-head", () => {
  it("branche disparue : tête effacée, snapshots conservés, dépôt vérifié AVANT l'effacement, UN audit head_removed", async () => {
    await bench.push(scene, { after: await bench.commit(scene, feature(1)) });
    await runReconcile(bench);
    const snapshots = (await bench.snapshots(scene)).length;
    bench.spy.reset();
    failBranch(bench, scene, "cadrage");

    const summary = await runReconcile(bench);

    expect(await bench.headSha(scene)).toBeUndefined();
    expect((await bench.snapshots(scene)).length).toBe(snapshots);
    expect(callsFor(bench, scene, "getRepo").length).toBeGreaterThanOrEqual(1);
    expect(summary.heads).toMatchObject({ removed: 1, unreachable: 0 });
    const rows = await headAudit(bench, scene, "repo.reconcile.head_removed");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_kind: "system",
      target_kind: "repo",
      target_id: scene.repoId,
    });
    expect(await bench.headSha(scene, "main")).toBeDefined();
  });

  it("run suivant : la branche n'est plus connue, aucun audit de plus", async () => {
    await bench.push(scene, { after: await bench.commit(scene, feature(1)) });
    await runReconcile(bench);
    failBranch(bench, scene, "cadrage");
    await runReconcile(bench);
    const baseline = await audits();

    const summary = await runReconcile(bench);

    expect(await audits()).toBe(baseline);
    expect(summary.heads).toMatchObject({ removed: 0 });
  });
});

describe("reconcile-deleted-branch : dépôt injoignable", () => {
  it("dépôt retiré (404 « ref » puis getRepo 404) : têtes conservées, UN audit unreachable, jamais dupliqué", async () => {
    await bench.push(scene, { after: await bench.commit(scene, feature(1)) });
    await runReconcile(bench);
    const before = await bench.headSha(scene);
    failFor(bench, scene, {
      listFiles: missingRef,
      getRepo: () => missingRepository(),
    });

    const first = await runReconcile(bench);
    const second = await runReconcile(bench);

    expect(before).toBeDefined();
    expect(await bench.headSha(scene)).toBe(before);
    expect(await bench.headSha(scene, "main")).toBeDefined();
    expect(first.heads).toMatchObject({ unreachable: 1, removed: 0 });
    expect(second.failedPasses ?? []).toEqual([]);
    const rows = await headAudit(bench, scene, "repo.reconcile.unreachable");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_kind: "system",
      target_kind: "repo",
      target_id: scene.repoId,
    });
    expect(await audits("repo.reconcile.head_removed")).toBe(0);
  });

  it("un dépôt injoignable est terminé : last_reconciled_at avance (la rotation ne le rejoue pas en tête)", async () => {
    await runReconcile(bench);
    failFor(bench, scene, { listFiles: missingRef, getRepo: () => missingRepository() });
    const started = new Date();

    await runReconcile(bench);

    expect((await reconciledAt(bench, scene))?.getTime()).toBeGreaterThanOrEqual(started.getTime());
  });
});

describe("périmètre de P4", () => {
  it("un dépôt sans spec (rôle front, pas de spec_path) n'est ni authentifié ni lu", async () => {
    const code = await addCodeRepo(bench, scene);
    bench.spy.reset();

    await runReconcile(bench);

    const touched = bench.spy.calls.filter(
      (call) => (call.request.repo as { name?: string } | undefined)?.name === code.name,
    );
    expect(touched).toEqual([]);
    const [heads] = await bench.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM spec_heads WHERE repo_id = $1",
      [code.repoId],
    );
    expect(heads?.n).toBe("0");
  });

  it.each(["suspended", "deleted"])(
    "installation %s : dépôt sauté, aucun appel fournisseur, tête intacte",
    async (status) => {
      await bench.push(scene, { after: await bench.commit(scene, feature(1)) });
      const before = await bench.headSha(scene);
      await bench.query(
        "UPDATE provider_installations SET status = $2::text::installation_status WHERE id = $1",
        [scene.installationId, status],
      );
      bench.spy.reset();

      const summary = await runReconcile(bench);

      expect(callsFor(bench, scene)).toEqual([]);
      expect(await bench.headSha(scene)).toBe(before);
      expect(summary.heads?.skipped).toBeGreaterThanOrEqual(1);
    },
  );

  it("spec dans un monorepo (spec_path) : la tête déplacée est rattrapée aussi", async () => {
    const mono = await bench.scene({ specPath: "spec" });
    await bench.push(mono, { after: await bench.commit(mono, feature(1)) });
    await runReconcile(bench);
    const moved = await bench.commit(mono, feature(2));

    await runReconcile(bench);

    expect(await bench.headSha(mono)).toBe(moved);
  });
});
