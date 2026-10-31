import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BOT, createPayload, type Scene, WorkerBench } from "./support/spec-write-bench.ts";

/**
 * TK-44b §4.6 : crash entre le commit et la mise à jour de la base. Le trailer `Koklo-Ops: <batchId>`
 * est cherché dans les 50 derniers commits de la branche : trouvé = `committed` sans recommit ;
 * non trouvé = INCONNU quand la fenêtre de 50 est pleine et que le lot a déjà été pris (jamais
 * « non commité » : on ne risque pas un second commit).
 */
let bench: WorkerBench;

beforeAll(async () => {
  bench = await WorkerBench.create();
  await bench.start({ specWrite: { retryLimit: 1, retryDelaySeconds: 2 } });
}, 240_000);
afterAll(async () => {
  await bench?.dispose();
});
beforeEach(() => {
  bench.spy.reset();
});

const create = (specId: string, title: string) => ({
  kind: "feature.create",
  specId,
  payload: createPayload(title),
});

/** Commit déjà posé chez le fournisseur par une exécution précédente (crash avant la base). */
async function commitAsBot(scene: Scene, batchId: string, path = "features/F-001-orpheline.md") {
  const auth = await bench.spy.auth(scene.owner);
  return bench.spy.inner.writeCommit({
    auth,
    repo: scene.ref,
    branch: "cadrage",
    author: BOT,
    message: `spec: créé F-001\n\nKoklo-Ops: ${batchId}\n`,
    files: [{ path, content: "contenu posé avant le crash\n" }],
  });
}

async function pile(scene: Scene, count: number) {
  const auth = await bench.spy.auth(scene.owner);
  for (let i = 0; i < count; i += 1) {
    await bench.spy.inner.writeCommit({
      auth,
      repo: scene.ref,
      branch: "cadrage",
      author: BOT,
      message: `chore: bruit ${i}`,
      files: [{ path: `notes/${i}.md`, content: `${i}\n` }],
    });
  }
}

describe("reprise après crash par recherche du trailer", () => {
  it("commit retrouvé dans les 50 derniers commits : committed avec ce SHA, sans second commit", async () => {
    const scene = await bench.scene();
    const id = await bench.insertBatch(scene, {
      status: "committing",
      operations: [create("F-001", "Orpheline")],
    });
    const posted = await commitAsBot(scene, id);
    await pile(scene, 3);
    const commits = (await bench.commits(scene)).length;
    bench.spy.reset();

    await bench.enqueue(scene, id);
    const row = await bench.settled(id);

    expect(row.status).toBe("committed");
    expect(row.commit_sha).toBe(posted.sha);
    expect(row.committed_at).toBeInstanceOf(Date);
    expect(bench.spy.callsOf("writeCommit")).toEqual([]);
    expect(bench.spy.callsOf("listCommits").length).toBeGreaterThan(0);
    expect((await bench.commits(scene)).length).toBe(commits);
    expect((await bench.jobCompleted(id)).state).toBe("completed");
  });

  it("le commit posé aussi pour un lot encore queued (job rejoué avant la première transition) est retrouvé", async () => {
    const scene = await bench.scene();
    const id = await bench.insertBatch(scene, {
      status: "queued",
      operations: [create("F-001", "Orpheline")],
    });
    const posted = await commitAsBot(scene, id);

    await bench.enqueue(scene, id);
    const row = await bench.settled(id);

    expect(row).toMatchObject({ status: "committed", commit_sha: posted.sha });
    expect(bench.spy.callsOf("writeCommit")).toEqual([]);
  });
});

describe("reprise après crash par recherche du trailer (suite 2)", () => {
  it("échec de la mise à jour en base après le commit : le job relancé marque committed avec le même SHA", async () => {
    const scene = await bench.scene();
    await bench.query("CREATE TABLE IF NOT EXISTS commit_fail (flag boolean)");
    await bench.query(`
      CREATE OR REPLACE FUNCTION commit_fail_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status = 'committed' AND EXISTS (SELECT 1 FROM commit_fail) THEN
          RAISE EXCEPTION 'mise à jour refusée pour le test';
        END IF;
        RETURN NEW;
      END $$`);
    await bench.query("DROP TRIGGER IF EXISTS commit_fail_trigger ON spec_write_batches");
    await bench.query(
      "CREATE TRIGGER commit_fail_trigger BEFORE UPDATE ON spec_write_batches FOR EACH ROW EXECUTE FUNCTION commit_fail_guard()",
    );
    await bench.query("INSERT INTO commit_fail VALUES (true)");
    try {
      const id = await bench.insertBatch(scene, { operations: [create("F-001", "Crash")] });
      await bench.enqueue(scene, id);
      // Le commit est posé, la base refuse ; le flag est levé avant le nouvel essai (délai de 2 s).
      await vi.waitFor(() => expect(bench.spy.callsOf("writeCommit")).toHaveLength(1), {
        timeout: 30_000,
        interval: 25,
      });
      await bench.query("DELETE FROM commit_fail");

      const row = await bench.settled(id);

      expect(row.status).toBe("committed");
      expect(bench.spy.callsOf("writeCommit")).toHaveLength(1);
      expect(row.commit_sha).toBe((await bench.commits(scene))[0]?.sha);
      // Un seul commit de lot au-dessus de l'amorçage (« chore: initialise ») et du « Initial commit » du faux.
      const commits = await bench.commits(scene);
      expect(commits).toHaveLength(3);
      expect(commits.map((commit) => commit.message.split("\n")[0]).slice(1)).toEqual([
        "chore: initialise",
        "Initial commit",
      ]);
      expect(commits[0]?.message).toContain(`Koklo-Ops: ${id}`);
      expect(bench.spy.callsOf("listCommits").length).toBeGreaterThan(0);
    } finally {
      await bench.query("DELETE FROM commit_fail");
      await bench.query("DROP TRIGGER IF EXISTS commit_fail_trigger ON spec_write_batches");
    }
  });
});

describe("trailer non trouvé : inconnu, pas « non commité »", () => {
  it("lot déjà pris (committing) et fenêtre de 50 commits pleine sans trailer : failed / INTERNAL, aucun recommit", async () => {
    const scene = await bench.scene();
    const id = await bench.insertBatch(scene, {
      status: "committing",
      operations: [create("F-001", "Inconnu")],
    });
    await pile(scene, 55);
    const commits = (await bench.commits(scene, "cadrage", 50)).length;
    bench.spy.reset();

    await bench.enqueue(scene, id);
    const row = await bench.settled(id);

    expect(commits).toBe(50);
    expect(row).toMatchObject({ status: "failed", error_code: "INTERNAL", commit_sha: null });
    expect(bench.spy.callsOf("writeCommit")).toEqual([]);
    const listing = bench.spy.callsOf("listCommits");
    expect(listing.length).toBeGreaterThan(0);
    expect(Number(listing[0]?.request.limit ?? 50)).toBeLessThanOrEqual(50);
    expect((await bench.jobCompleted(id)).state).toBe("completed");
  });

  it("lot déjà pris mais historique entièrement lu (< 50 commits) sans trailer : exécution normale", async () => {
    const scene = await bench.scene();
    const id = await bench.insertBatch(scene, {
      status: "committing",
      operations: [create("F-001", "Jamais commité")],
    });
    await pile(scene, 4);

    await bench.enqueue(scene, id);
    const row = await bench.settled(id);

    expect(row.status).toBe("committed");
    expect(bench.spy.callsOf("writeCommit")).toHaveLength(1);
  });
});

describe("trailer non trouvé : inconnu, pas « non commité » (suite 2)", () => {
  it("première exécution (queued) sur une branche de plus de 50 commits : exécution normale", async () => {
    const scene = await bench.scene();
    const id = await bench.insertBatch(scene, {
      status: "queued",
      operations: [create("F-001", "Première fois")],
    });
    await pile(scene, 55);

    await bench.enqueue(scene, id);
    const row = await bench.settled(id);

    expect(row.status).toBe("committed");
    expect(bench.spy.callsOf("writeCommit")).toHaveLength(1);
  });
});
