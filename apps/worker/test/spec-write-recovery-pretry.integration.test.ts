import { GitProviderUnavailableError } from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BOT, createPayload, type Scene, WorkerBench } from "./support/spec-write-bench.ts";

/**
 * TK-44b, correction 2 : « jamais tenté d'écrire » ≠ « crash possible après writeCommit ».
 * Une panne transitoire AVANT `writeCommit` (listFiles, readFile) ne doit jamais rendre le lot
 * « inconnu » (failed / INTERNAL) au nouvel essai, même sur une branche d'au moins 50 commits.
 * Les tests ne présupposent pas la conception (remise en `queued` ou marqueur « writeCommit tenté ») :
 * ils n'observent que le statut final du lot, son code d'erreur, le nombre de commits et leur contenu.
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

/** Commits de la branche portant le trailer du lot (toute l'historique lisible par le faux). */
async function opsCommits(scene: Scene, batchId: string) {
  const commits = await bench.commits(scene, "cadrage", 500);
  return commits.filter((commit) => commit.message.includes(`Koklo-Ops: ${batchId}`));
}

const unavailable = (operation: string) => new GitProviderUnavailableError({ operation });

describe("panne transitoire AVANT writeCommit sur une branche d'au moins 50 commits", () => {
  it("(a) listFiles en 503 au 1er essai, succès au 2e : committed, UN seul commit du bot avec le trailer", async () => {
    const scene = await bench.scene();
    const id = await bench.insertBatch(scene, { operations: [create("F-001", "Avant écriture")] });
    await pile(scene, 60);
    bench.spy.reset();
    bench.spy.failWith("listFiles", unavailable("listFiles"), 1);

    await bench.enqueue(scene, id);
    const row = await bench.settled(id);

    expect(row.status).toBe("committed");
    expect(row.error_code).toBeNull();
    expect(bench.spy.callsOf("writeCommit")).toHaveLength(1);
    const posted = await opsCommits(scene, id);
    expect(posted).toHaveLength(1);
    expect(row.commit_sha).toBe(posted[0]?.sha);
    // Le listing est plafonné à 50 commits (contrat) : on vérifie la tête, pas un total.
    expect((await bench.commits(scene, "cadrage", 1))[0]?.sha).toBe(row.commit_sha);
    expect((await bench.job(id))?.state).toBe("completed");
  });

  it("(a bis) readFile en 503 au 1er essai (lecture de la spec), succès au 2e : committed, un seul commit", async () => {
    const scene = await bench.scene();
    const id = await bench.insertBatch(scene, { operations: [create("F-001", "Lecture")] });
    // Un fichier reconnu de la spec force au moins un readFile avant le plan.
    const auth = await bench.spy.auth(scene.owner);
    await bench.spy.inner.writeCommit({
      auth,
      repo: scene.ref,
      branch: "cadrage",
      author: BOT,
      message: "chore: fichier existant",
      files: [{ path: "features/F-000-existante.md", content: "---\nid: F-000\n---\n" }],
    });
    await pile(scene, 60);
    bench.spy.reset();
    bench.spy.failWith("readFile", unavailable("readFile"), 1);

    await bench.enqueue(scene, id);
    const row = await bench.settled(id);

    expect(bench.spy.callsOf("readFile").length).toBeGreaterThan(0);
    expect(row.status).toBe("committed");
    expect(await opsCommits(scene, id)).toHaveLength(1);
  });
});

describe("panne transitoire AVANT writeCommit à chaque essai", () => {
  it("(b) panne avant writeCommit à chaque essai : failed / PROVIDER_UNAVAILABLE (pas INTERNAL), sans commit, sans lever", async () => {
    const scene = await bench.scene();
    const id = await bench.insertBatch(scene, { operations: [create("F-001", "Panne longue")] });
    await pile(scene, 60);
    const before = (await bench.commits(scene, "cadrage", 500)).length;
    bench.spy.reset();
    bench.spy.failWith("listFiles", unavailable("listFiles"));

    await bench.enqueue(scene, id);
    const row = await bench.settled(id);

    expect(row).toMatchObject({
      status: "failed",
      error_code: "PROVIDER_UNAVAILABLE",
      commit_sha: null,
    });
    expect(bench.spy.callsOf("writeCommit")).toEqual([]);
    expect(await opsCommits(scene, id)).toEqual([]);
    expect((await bench.commits(scene, "cadrage", 500)).length).toBe(before);
    expect((await bench.job(id))?.state).toBe("completed");
  });
});

describe("le vrai cas « inconnu » reste inconnu", () => {
  it("(c) crash après un writeCommit réussi, commit hors de la fenêtre de 50 : failed / INTERNAL, aucun recommit", async () => {
    const scene = await bench.scene();
    const id = await bench.insertBatch(scene, {
      status: "committing",
      operations: [create("F-001", "Hors fenêtre")],
    });
    const auth = await bench.spy.auth(scene.owner);
    await bench.spy.inner.writeCommit({
      auth,
      repo: scene.ref,
      branch: "cadrage",
      author: BOT,
      message: `spec: créé F-001\n\nKoklo-Ops: ${id}\n`,
      files: [{ path: "features/F-001-posee.md", content: "posé avant le crash\n" }],
    });
    await pile(scene, 55);
    const before = (await bench.commits(scene, "cadrage", 500)).length;
    bench.spy.reset();

    await bench.enqueue(scene, id);
    const row = await bench.settled(id);

    expect(row).toMatchObject({ status: "failed", error_code: "INTERNAL", commit_sha: null });
    expect(bench.spy.callsOf("writeCommit")).toEqual([]);
    expect((await bench.commits(scene, "cadrage", 500)).length).toBe(before);
    expect((await bench.job(id))?.state).toBe("completed");
  });

  it("(d) crash après writeCommit, trailer dans les 50 derniers commits : committed sans recommit", async () => {
    const scene = await bench.scene();
    const id = await bench.insertBatch(scene, {
      status: "committing",
      operations: [create("F-001", "Dans la fenêtre")],
    });
    const auth = await bench.spy.auth(scene.owner);
    const posted = await bench.spy.inner.writeCommit({
      auth,
      repo: scene.ref,
      branch: "cadrage",
      author: BOT,
      message: `spec: créé F-001\n\nKoklo-Ops: ${id}\n`,
      files: [{ path: "features/F-001-posee.md", content: "posé avant le crash\n" }],
    });
    await pile(scene, 20);
    bench.spy.reset();

    await bench.enqueue(scene, id);
    const row = await bench.settled(id);

    expect(row).toMatchObject({ status: "committed", commit_sha: posted.sha });
    expect(bench.spy.callsOf("writeCommit")).toEqual([]);
  });
});

describe("panne transitoire sur writeCommit lui-même (réponse perdue) : jamais de double commit", () => {
  /**
   * Le fournisseur écrit réellement le commit puis la réponse est perdue (503 côté worker). Attendu :
   * le nouvel essai cherche le trailer, retrouve le commit et marque le lot `committed` avec ce SHA,
   * sans second `writeCommit` réussi.
   */
  async function lostResponse(scene: Scene) {
    let wrote = false;
    bench.spy.hooks.set("writeCommit", async (request) => {
      if (wrote) return;
      wrote = true;
      await bench.spy.inner.writeCommit(request as never);
    });
    bench.spy.failWith("writeCommit", unavailable("writeCommit"), 1);
    return scene;
  }

  it("(e) branche d'au moins 50 commits : committed avec le SHA déjà posé, un seul commit du lot", async () => {
    const scene = await bench.scene();
    const id = await bench.insertBatch(scene, { operations: [create("F-001", "Réponse perdue")] });
    await pile(scene, 60);
    bench.spy.reset();
    await lostResponse(scene);

    await bench.enqueue(scene, id);
    const row = await bench.settled(id);

    const posted = await opsCommits(scene, id);
    expect(posted).toHaveLength(1);
    expect(row).toMatchObject({ status: "committed", commit_sha: posted[0]?.sha });
    expect(bench.spy.callsOf("writeCommit")).toHaveLength(1);
    expect((await bench.job(id))?.state).toBe("completed");
  });

  it("(f) branche courte : committed avec le SHA déjà posé, un seul commit du lot", async () => {
    const scene = await bench.scene();
    const id = await bench.insertBatch(scene, { operations: [create("F-001", "Réponse perdue")] });
    await pile(scene, 3);
    bench.spy.reset();
    await lostResponse(scene);

    await bench.enqueue(scene, id);
    const row = await bench.settled(id);

    const posted = await opsCommits(scene, id);
    expect(posted).toHaveLength(1);
    expect(row).toMatchObject({ status: "committed", commit_sha: posted[0]?.sha });
    expect(bench.spy.callsOf("writeCommit")).toHaveLength(1);
  });
});
