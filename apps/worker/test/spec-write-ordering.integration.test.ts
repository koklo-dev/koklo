import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createPayload,
  type Scene,
  SPEC_WRITE_QUEUE,
  WorkerBench,
} from "./support/spec-write-bench.ts";

/**
 * TK-44b §5.1 : sérialisation par clé `repoId:branche` (key_strict_fifo) : deux lots sur la même
 * branche ne s'exécutent jamais en parallèle et sortent dans l'ordre d'enfilage ; des branches
 * différentes progressent en parallèle ; un échec métier ne bloque pas la clé.
 */
let bench: WorkerBench;

beforeAll(async () => {
  bench = await WorkerBench.create();
  await bench.start();
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

/** Enfile les lots dans l'ordre, un par un, et rend leurs identifiants. */
async function enqueueAll(scene: Scene, branch: string, titles: string[], firstNumber: number) {
  const ids: string[] = [];
  for (const [index, title] of titles.entries()) {
    const id = await bench.insertBatch(scene, {
      branch,
      operations: [create(`F-${String(firstNumber + index).padStart(3, "0")}`, title)],
    });
    await bench.enqueue(scene, id, branch);
    ids.push(id);
  }
  return ids;
}

describe("même branche", () => {
  it("trois lots ne s'exécutent jamais en parallèle et sortent en FIFO, commits chaînés", async () => {
    const scene = await bench.scene();
    let inFlight = 0;
    let maxInFlight = 0;
    bench.spy.hooks.set("writeCommit", async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 300));
      inFlight -= 1;
    });

    const ids = await enqueueAll(scene, "cadrage", ["Un", "Deux", "Trois"], 1);
    const rows = await Promise.all(ids.map((id) => bench.settled(id)));

    for (const row of rows) expect(row.status).toBe("committed");
    expect(maxInFlight).toBe(1);
    const commits = await bench.commits(scene);
    // Du plus récent au plus ancien : lot 3, lot 2, lot 1, commit initial.
    expect(commits.slice(0, 3).map((commit) => commit.sha)).toEqual(
      rows.map((row) => row.commit_sha).reverse(),
    );
    commits.slice(0, 3).forEach((commit, index) => {
      expect(commit.parents[0]).toBe(commits[index + 1]?.sha);
      expect(commit.message).toContain(`Koklo-Ops: ${[...ids].reverse()[index]}`);
    });
    expect(await bench.files(scene)).toEqual(
      expect.arrayContaining([
        "features/F-001-un.md",
        "features/F-002-deux.md",
        "features/F-003-trois.md",
      ]),
    );
  });

  it("la clé du job est repoId:branche et la file est key_strict_fifo", async () => {
    const scene = await bench.scene();
    const [id] = await enqueueAll(scene, "cadrage", ["Clé"], 1);
    await bench.settled(id ?? "");

    const job = await bench.job(id ?? "");
    const queue = await bench.worker?.boss.getQueue(SPEC_WRITE_QUEUE);

    expect(job?.singletonKey).toBe(`${scene.repoId}:cadrage`);
    expect(queue?.policy).toBe("key_strict_fifo");
  });
});

describe("branches différentes", () => {
  it("s'exécutent en parallèle (barrière à deux) et restent chacune ordonnées", async () => {
    const scene = await bench.scene();
    const auth = await bench.spy.auth(scene.owner);
    await bench.spy.inner.createBranch({ auth, repo: scene.ref, base: "main", name: "autre" });
    // Les deux premiers writeCommit attendent d'être simultanés : en série, la barrière expire.
    let arrived = 0;
    let release: () => void = () => undefined;
    const both = new Promise<void>((resolve) => {
      release = resolve;
    });
    let gated = 0;
    bench.spy.hooks.set("writeCommit", async () => {
      if (gated >= 2) return;
      gated += 1;
      arrived += 1;
      if (arrived >= 2) release();
      await Promise.race([
        both,
        new Promise((_resolve, reject) =>
          setTimeout(
            () => reject(new Error("écritures de branches différentes non simultanées")),
            15_000,
          ),
        ),
      ]);
    });

    const a = await enqueueAll(scene, "cadrage", ["A1", "A2"], 1);
    const b = await enqueueAll(scene, "autre", ["B1", "B2"], 11);
    const rows = await Promise.all([...a, ...b].map((id) => bench.settled(id)));

    for (const row of rows) expect(row.status).toBe("committed");
    for (const branch of ["cadrage", "autre"]) {
      const [newest, older, base] = await bench.commits(scene, branch);
      expect(newest?.parents[0]).toBe(older?.sha);
      expect(older?.parents[0]).toBe(base?.sha);
    }
  });
});

describe("un échec métier ne bloque pas la clé", () => {
  it("un lot SPEC_INVALID n'empêche pas le suivant de la branche ; le job termine normalement", async () => {
    const scene = await bench.scene();
    const bad = await bench.insertBatch(scene, {
      operations: [
        {
          kind: "feature.create",
          specId: "F-001",
          payload: createPayload("Mauvais", { tables: ["T-nulle"] }),
        },
      ],
    });
    const good = await bench.insertBatch(scene, { operations: [create("F-002", "Bon")] });
    await bench.enqueue(scene, bad);
    await bench.enqueue(scene, good);

    const [badRow, goodRow] = await Promise.all([bench.settled(bad), bench.settled(good)]);

    expect(badRow).toMatchObject({ status: "failed", error_code: "SPEC_INVALID" });
    expect(goodRow.status).toBe("committed");
    expect((await bench.jobCompleted(bad)).state).toBe("completed");
    expect((await bench.jobCompleted(good)).state).toBe("completed");
  });

  it("aucun job de la file ne reste en état failed après des échecs métier de toute nature", async () => {
    const scene = await bench.scene();
    const ids = [
      await bench.insertBatch(scene, {
        baseSha: "b".repeat(40),
        operations: [create("F-001", "Périmé")],
      }),
      await bench.insertBatch(scene, { operations: [{ kind: "feature.delete", specId: "F-777" }] }),
      await bench.insertBatch(scene, {
        authorRole: "designer",
        operations: [create("F-002", "Sans écran")],
      }),
    ];
    for (const id of ids) await bench.enqueue(scene, id);
    await Promise.all(ids.map((id) => bench.settled(id)));

    const failed = await bench.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pgboss.job WHERE name = $1 AND state = 'failed'",
      [SPEC_WRITE_QUEUE],
    );

    expect(failed[0]?.n).toBe(0);
  });
});
