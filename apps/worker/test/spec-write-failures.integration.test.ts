import {
  GitAuthExpiredError,
  GitProviderUnavailableError,
  GitRateLimitedError,
} from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPayload, type Scene, WorkerBench } from "./support/spec-write-bench.ts";

/**
 * TK-44b §5.1 : panne transitoire relancée par pg-boss ; au dernier essai le lot est écrit `failed`
 * avec le code et le job termine SANS lever (sinon key_strict_fifo bloque la branche).
 * Essais réglés par `specWrite: { retryLimit: 1, retryDelaySeconds: 1 }` (2 exécutions au plus).
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

async function enqueue(scene: Scene, specId: string, title: string) {
  const id = await bench.insertBatch(scene, { operations: [create(specId, title)] });
  await bench.enqueue(scene, id);
  return id;
}

describe("panne transitoire du fournisseur", () => {
  it("une panne passagère est relancée : le lot est committed, un seul commit", async () => {
    const scene = await bench.scene();
    bench.spy.failWith(
      "writeCommit",
      new GitProviderUnavailableError({ operation: "writeCommit" }),
      1,
    );

    const id = await enqueue(scene, "F-001", "Passagère");
    const row = await bench.settled(id);

    expect(row.status).toBe("committed");
    expect(bench.spy.callsOf("writeCommit").length).toBeGreaterThanOrEqual(2);
    // Un seul commit de lot au-dessus de l'amorçage (« chore: initialise ») et du « Initial commit » du faux.
    const commits = await bench.commits(scene);
    expect(commits).toHaveLength(3);
    expect(commits.map((commit) => commit.message.split("\n")[0]).slice(1)).toEqual([
      "chore: initialise",
      "Initial commit",
    ]);
    expect(commits[0]?.message).toContain(`Koklo-Ops: ${id}`);
    expect((await bench.job(id))?.state).toBe("completed");
  });
});

describe("panne transitoire du fournisseur (suite 2)", () => {
  it("une panne prolongée : failed / PROVIDER_UNAVAILABLE au dernier essai, sans lever ; le lot suivant passe", async () => {
    const scene = await bench.scene();
    bench.spy.failWith(
      "writeCommit",
      new GitProviderUnavailableError({ operation: "writeCommit" }),
    );
    const first = await enqueue(scene, "F-001", "Panne");
    const second = await enqueue(scene, "F-002", "Après la panne");

    const firstRow = await bench.settled(first);
    // La panne cesse : le lot suivant de la même branche n'est pas bloqué derrière le premier.
    bench.spy.failures.clear();
    const secondRow = await bench.settled(second);

    expect(firstRow).toMatchObject({
      status: "failed",
      error_code: "PROVIDER_UNAVAILABLE",
      commit_sha: null,
    });
    expect(secondRow.status).toBe("committed");
    expect((await bench.job(first))?.state).toBe("completed");
    expect(bench.spy.callsOf("writeCommit").length).toBeGreaterThanOrEqual(3);
    const failedJobs = await bench.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'spec-write' AND state = 'failed'",
    );
    expect(failedJobs[0]?.n).toBe(0);
  });

  it("limite de débit persistante : failed / PROVIDER_RATE_LIMITED", async () => {
    const scene = await bench.scene();
    bench.spy.failWith(
      "listFiles",
      new GitRateLimitedError({ operation: "listFiles", retryAfterMs: 1000 }),
    );

    const row = await bench.settled(await enqueue(scene, "F-001", "Limitée"));

    expect(row).toMatchObject({ status: "failed", error_code: "PROVIDER_RATE_LIMITED" });
  });
});

describe("panne transitoire du fournisseur (suite 3)", () => {
  it("autorisation expirée : résultat métier immédiat (failed / PROVIDER_AUTH_EXPIRED), un seul essai", async () => {
    const scene = await bench.scene();
    bench.spy.failWith(
      "authenticate",
      new GitAuthExpiredError({
        operation: "authenticate",
        kind: "installation",
        refreshable: false,
      }),
    );

    const id = await enqueue(scene, "F-001", "Expirée");
    const row = await bench.settled(id);

    expect(row).toMatchObject({ status: "failed", error_code: "PROVIDER_AUTH_EXPIRED" });
    expect(bench.spy.callsOf("authenticate")).toHaveLength(1);
    expect((await bench.job(id))?.state).toBe("completed");
  });

  it("aucun message brut du fournisseur ni jeton dans le lot après un échec", async () => {
    const scene = await bench.scene();
    bench.spy.failWith(
      "writeCommit",
      Object.assign(new GitProviderUnavailableError({ operation: "writeCommit" }), {
        body: "SECRET-RAW ghs_leaked",
      }),
    );

    const id = await enqueue(scene, "F-001", "Sans fuite");
    await bench.settled(id);

    const rows = await bench.query("SELECT * FROM spec_write_batches WHERE id = $1", [id]);
    expect(JSON.stringify(rows)).not.toContain("ghs_leaked");
    expect(JSON.stringify(rows)).not.toContain("SECRET-RAW");
  });
});

describe("chemins validés à l'entrée du lot, avant tout appel fournisseur", () => {
  it.each([
    ["traversée", "../x"],
    ["absolu", "/x"],
    ["dossier .git", ".git/config"],
    ["dossier", "features"],
    ["F-nnn avec séparateur", "F-001/../../x"],
    ["F-nnn suivi d'un chemin", "F-001/secret"],
    ["vide", ""],
  ])(
    "identifiant d'opération invalide (%s) : lot failed / INTERNAL, zéro appel fournisseur",
    async (_name, specId) => {
      const scene = await bench.scene();
      const id = await bench.insertBatch(scene, {
        operations: [{ kind: "feature.delete", specId }],
      });
      await bench.enqueue(scene, id);

      const row = await bench.settled(id);

      expect(row).toMatchObject({ status: "failed", error_code: "INTERNAL", commit_sha: null });
      expect(bench.spy.calls).toEqual([]);
      expect((await bench.job(id))?.state).toBe("completed");
    },
  );

  // `specPath` que la CHECK `project_repos_spec_path_check` laisse passer : seul le handler les refuse.
  it.each([".git", "docs//spec"])(
    "specPath %j du repo : refusé, aucune écriture, zéro appel d'écriture",
    async (specPath) => {
      const scene = await bench.scene();
      await bench.query(
        "UPDATE project_repos SET role = 'monorepo', spec_path = $2 WHERE id = $1",
        [scene.repoId, specPath],
      );

      const row = await bench.settled(await enqueue(scene, "F-001", "Chemin hostile"));

      expect(row).toMatchObject({ status: "failed", error_code: "INTERNAL", commit_sha: null });
      expect(bench.spy.callsOf("writeCommit")).toEqual([]);
      expect(bench.spy.calls).toEqual([]);
    },
  );
});

describe("specPath refusé par la CHECK de la base puis par le handler (défense en profondeur)", () => {
  // Défense en profondeur testée des deux côtés : la base refuse d'abord ces valeurs (test 1) ; la
  // CHECK n'est pas différable, donc le test 2 la retire le temps du cas (restaurée dans `finally`)
  // pour que le handler, seconde barrière, soit réellement exercé.
  const CHECK_REFUSED = ["../x", "/abs", "a/../b"];

  it.each(CHECK_REFUSED)("specPath %j : la CHECK de la base refuse la valeur", async (specPath) => {
    const scene = await bench.scene();

    await expect(
      bench.query("UPDATE project_repos SET role = 'monorepo', spec_path = $2 WHERE id = $1", [
        scene.repoId,
        specPath,
      ]),
    ).rejects.toThrow(/project_repos_spec_path_check/);
  });

  it.each(CHECK_REFUSED)(
    "specPath %j sans la CHECK de la base : le handler le refuse, aucune écriture, zéro appel fournisseur",
    async (specPath) => {
      const scene = await bench.scene();
      const [check] = await bench.query<{ def: string }>(
        "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'project_repos_spec_path_check'",
      );
      expect(check?.def).toBeDefined();
      await bench.query("ALTER TABLE project_repos DROP CONSTRAINT project_repos_spec_path_check");
      try {
        await bench.query(
          "UPDATE project_repos SET role = 'monorepo', spec_path = $2 WHERE id = $1",
          [scene.repoId, specPath],
        );

        const row = await bench.settled(await enqueue(scene, "F-001", "Chemin hostile"));

        expect(row).toMatchObject({ status: "failed", error_code: "INTERNAL", commit_sha: null });
        expect(bench.spy.callsOf("writeCommit")).toEqual([]);
        expect(bench.spy.calls).toEqual([]);
      } finally {
        // La valeur hostile partie, la CHECK d'origine est remise telle quelle.
        await bench.query("UPDATE project_repos SET spec_path = NULL WHERE id = $1", [
          scene.repoId,
        ]);
        await bench.query(
          `ALTER TABLE project_repos ADD CONSTRAINT project_repos_spec_path_check ${check?.def}`,
        );
      }
    },
  );
});

describe("chemins validés à l'entrée du lot, avant tout appel fournisseur (suite 2)", () => {
  it("branche invalide dans le lot (../x) : refusée avant tout appel", async () => {
    const scene = await bench.scene();
    const id = await bench.insertBatch(scene, {
      branch: "../x",
      operations: [create("F-001", "Branche")],
    });
    await bench.enqueue(scene, id, "../x");

    const row = await bench.settled(id);

    expect(row).toMatchObject({ status: "failed", error_code: "INTERNAL" });
    expect(bench.spy.calls).toEqual([]);
  });
});
