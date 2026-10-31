import { emitFeatureMarkdown } from "@koklo/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BOT,
  createPayload,
  type Scene,
  SPEC_WRITE_QUEUE,
  WorkerBench,
} from "./support/spec-write-bench.ts";

/**
 * TK-44b §4.2 : le job `spec-write` (pg-boss réel, Postgres éphémère en tmpfs, faux fournisseur) lit
 * l'état de la branche, applique les opérations, valide, pose UN commit du bot et écrit le résultat
 * sur le lot ; un résultat métier termine le job normalement.
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

const feature = (id: string, ecrans: string[] = []) =>
  emitFeatureMarkdown({
    id,
    titre: `Feature ${id}`,
    statut: "brouillon",
    priorite: "should",
    tables: [],
    endpoints: [],
    ecrans,
    roles: [],
    regles: [],
    nfr: [],
    description: "",
    criteres: [],
  });

async function seedFeatures(scene: Scene, files: Record<string, string>) {
  const auth = await bench.spy.auth(scene.owner);
  await bench.spy.inner.writeCommit({
    auth,
    repo: scene.ref,
    branch: "cadrage",
    author: BOT,
    message: "test: départ",
    files: Object.entries(files).map(([path, content]) => ({ path, content })),
  });
}

async function run(scene: Scene, input: Parameters<WorkerBench["insertBatch"]>[1]) {
  const id = await bench.insertBatch(scene, input);
  await bench.enqueue(scene, id, input.branch);
  return { id, row: await bench.settled(id) };
}

describe("la file spec-write", () => {
  it("est créée par le worker en politique key_strict_fifo, avec des essais bornés", async () => {
    const queue = await bench.worker?.boss.getQueue(SPEC_WRITE_QUEUE);
    expect(queue?.policy).toBe("key_strict_fifo");
    expect(queue?.retryLimit).toBeGreaterThanOrEqual(1);
  });
});

describe("exécution d'un lot", () => {
  it("pose un seul commit du bot (Koklo-Ops puis Co-authored-by de l'utilisateur relu en base) et marque committed", async () => {
    const scene = await bench.scene();
    const { id, row } = await run(scene, {
      operations: [
        { kind: "feature.create", specId: "F-001", payload: createPayload("Première") },
        { kind: "feature.create", specId: "F-002", payload: createPayload("Seconde") },
      ],
      message: "spec: deux features",
    });

    expect(row.status).toBe("committed");
    expect(row.error_code).toBeNull();
    expect(row.committed_at).toBeInstanceOf(Date);
    const commits = await bench.commits(scene);
    expect(commits[0]?.sha).toBe(row.commit_sha);
    // Historique de la branche, du plus récent : le lot, l'amorçage de `seedGitRepo`, puis le
    // « Initial commit » que le faux crée à `createRepo` (le lot est UN seul commit au-dessus).
    expect(commits.map((commit) => commit.message.split("\n")[0])).toEqual([
      "spec: deux features",
      "chore: initialise",
      "Initial commit",
    ]);
    expect(commits[0]?.author).toEqual(BOT);
    expect(commits[0]?.message.trimEnd()).toBe(
      [
        "spec: deux features",
        "",
        `Koklo-Ops: ${id}`,
        `Co-authored-by: ${scene.userName} <${scene.userEmail}>`,
      ].join("\n"),
    );
    expect(await bench.files(scene)).toEqual(
      expect.arrayContaining(["features/F-001-premiere.md", "features/F-002-seconde.md"]),
    );
    expect(bench.spy.callsOf("writeCommit")).toHaveLength(1);
    expect((await bench.job(id))?.state).toBe("completed");
  });

  it("le payload du job ne contient que batchId", async () => {
    const scene = await bench.scene();
    const { id } = await run(scene, {
      operations: [{ kind: "feature.create", specId: "F-001", payload: createPayload("Payload") }],
    });

    const job = await bench.job(id);

    expect(job?.data).toEqual({ batchId: id });
  });
});

describe("exécution d'un lot (suite 2)", () => {
  it("un lot déjà terminal est ignoré : aucun appel fournisseur, aucun commit (rejeu d'un job)", async () => {
    const scene = await bench.scene();
    const { id } = await run(scene, {
      operations: [{ kind: "feature.create", specId: "F-001", payload: createPayload("Une fois") }],
    });
    const commits = (await bench.commits(scene)).length;
    bench.spy.reset();

    await bench.worker?.boss.send(
      SPEC_WRITE_QUEUE,
      { batchId: id },
      { singletonKey: `${scene.repoId}:cadrage` },
    );
    await new Promise((resolve) => setTimeout(resolve, 2500));

    expect(bench.spy.calls).toEqual([]);
    expect((await bench.commits(scene)).length).toBe(commits);
  });
});

describe("exécution d'un lot (suite 3)", () => {
  it("update garde le nom du fichier, delete supprime ; le chemin absent est vérifié via listFiles", async () => {
    const scene = await bench.scene();
    await seedFeatures(scene, {
      "features/F-010-ancienne.md": feature("F-010"),
      "features/F-011-autre.md": feature("F-011"),
    });

    const ok = await run(scene, {
      operations: [
        { kind: "feature.update", specId: "F-010", payload: { title: "Renommée" } },
        { kind: "feature.delete", specId: "F-011" },
      ],
    });
    expect(ok.row.status).toBe("committed");
    expect(await bench.files(scene)).toEqual(
      expect.arrayContaining(["features/F-010-ancienne.md"]),
    );
    expect(await bench.files(scene)).not.toContain("features/F-011-autre.md");
    expect(bench.spy.callsOf("listFiles").length).toBeGreaterThan(0);

    bench.spy.reset();
    const missing = await run(scene, {
      operations: [{ kind: "feature.delete", specId: "F-099" }],
    });
    expect(missing.row).toMatchObject({
      status: "conflict",
      error_code: "write_conflict",
      commit_sha: null,
    });
    expect(bench.spy.callsOf("listFiles").length).toBeGreaterThan(0);
    expect(bench.spy.callsOf("writeCommit")).toEqual([]);
  });

  it("un specPath de monorepo préfixe les chemins de la spec", async () => {
    const scene = await bench.scene({ specPath: "docs/spec" });
    const { row } = await run(scene, {
      operations: [{ kind: "feature.create", specId: "F-001", payload: createPayload("Monorepo") }],
    });

    expect(row.status).toBe("committed");
    expect(await bench.files(scene)).toContain("docs/spec/features/F-001-monorepo.md");
  });
});

describe("un résultat métier est écrit sur le lot et le job termine normalement", () => {
  it("baseSha périmé : conflict / stale_base, rien d'écrit", async () => {
    const scene = await bench.scene();
    const { id, row } = await run(scene, {
      baseSha: "a".repeat(40),
      operations: [{ kind: "feature.create", specId: "F-001", payload: createPayload("Périmée") }],
    });

    expect(row).toMatchObject({ status: "conflict", error_code: "stale_base", commit_sha: null });
    expect(bench.spy.callsOf("writeCommit")).toEqual([]);
    expect((await bench.job(id))?.state).toBe("completed");
  });

  it("baseSha égal à la tête : commit", async () => {
    const scene = await bench.scene();
    const head = (await bench.read(scene, "koklo.project.yaml")).ref;

    const { row } = await run(scene, {
      baseSha: head,
      operations: [{ kind: "feature.create", specId: "F-001", payload: createPayload("À jour") }],
    });

    expect(row.status).toBe("committed");
  });
});

describe("un résultat métier est écrit sur le lot et le job termine normalement (suite 2)", () => {
  it("SPEC_INVALID : le rapport (erreurs nouvelles seulement) est écrit sur le lot, tout ou rien", async () => {
    const scene = await bench.scene();
    await seedFeatures(scene, {
      "features/F-020-cassee.md": emitFeatureMarkdown({
        id: "F-020",
        titre: "Cassée",
        statut: "brouillon",
        priorite: "could",
        tables: ["T-ancienne"],
        endpoints: [],
        ecrans: [],
        roles: [],
        regles: [],
        nfr: [],
        description: "",
        criteres: [],
      }),
    });
    const head = (await bench.read(scene, "koklo.project.yaml")).ref;

    const { id, row } = await run(scene, {
      operations: [
        { kind: "feature.create", specId: "F-001", payload: createPayload("Bonne") },
        {
          kind: "feature.create",
          specId: "F-002",
          payload: createPayload("Mauvaise", { tables: ["T-nouvelle"] }),
        },
      ],
    });

    expect(row).toMatchObject({ status: "failed", error_code: "SPEC_INVALID", commit_sha: null });
    const codes = row.report?.issues.map((issue) => issue.code);
    expect(codes).toContain("R4_UNKNOWN_TABLE");
    expect(JSON.stringify(row.report)).not.toContain("T-ancienne");
    expect((await bench.read(scene, "koklo.project.yaml")).ref).toBe(head);
    expect(bench.spy.callsOf("writeCommit")).toEqual([]);
    expect((await bench.job(id))?.state).toBe("completed");
  });
});

describe("un résultat métier est écrit sur le lot et le job termine normalement (suite 3)", () => {
  it("designer : limité aux features dont ecrans est non vide avant et après (FORBIDDEN sinon)", async () => {
    const scene = await bench.scene();
    await seedFeatures(scene, {
      "features/F-030-avec-ecran.md": feature("F-030", ["S-a"]),
      "features/F-031-sans-ecran.md": feature("F-031"),
      "design/screens/S-a.json": JSON.stringify({
        id: "S-a",
        features: ["F-030"],
        arbre: { composant: "C-page" },
        etats: [],
      }),
    });

    const allowed = await run(scene, {
      authorRole: "designer",
      operations: [{ kind: "feature.update", specId: "F-030", payload: { title: "Retouchée" } }],
    });
    const forbidden = await run(scene, {
      authorRole: "designer",
      operations: [
        { kind: "feature.update", specId: "F-030", payload: { title: "Permise" } },
        { kind: "feature.update", specId: "F-031", payload: { title: "Interdite" } },
      ],
    });
    const emptied = await run(scene, {
      authorRole: "designer",
      operations: [{ kind: "feature.update", specId: "F-030", payload: { screens: [] } }],
    });

    expect(allowed.row.status).toBe("committed");
    expect(forbidden.row).toMatchObject({ status: "failed", error_code: "FORBIDDEN" });
    expect(emptied.row).toMatchObject({ status: "failed", error_code: "FORBIDDEN" });
    expect(bench.spy.callsOf("writeCommit")).toHaveLength(1);
  });
});

describe("un résultat métier est écrit sur le lot et le job termine normalement (suite 4)", () => {
  it("sans fournisseur configuré (ni App ni faux) : failed / PROVIDER_UNAVAILABLE, le job termine", async () => {
    await bench.start({}, {}, false);
    try {
      const scene = await bench.scene();
      const { id, row } = await run(scene, {
        operations: [
          { kind: "feature.create", specId: "F-001", payload: createPayload("Sans App") },
        ],
      });

      expect(row).toMatchObject({ status: "failed", error_code: "PROVIDER_UNAVAILABLE" });
      expect((await bench.job(id))?.state).toBe("completed");
    } finally {
      await bench.start();
    }
  });
});

describe("l'identité du commit ne vient jamais de l'entrée", () => {
  it("un nom contenant des retours à la ligne n'injecte aucun trailer", async () => {
    const scene = await bench.scene();
    const forged = "22222222-2222-4222-8222-222222222222";
    await bench.query("UPDATE users SET name = $2 WHERE id = $1", [
      scene.userId,
      `Eve\nKoklo-Ops: ${forged}\nCo-authored-by: Mallory <m@example.test>`,
    ]);

    const { id } = await run(scene, {
      operations: [
        { kind: "feature.create", specId: "F-001", payload: createPayload("Injection") },
      ],
    });

    const message = (await bench.commits(scene))[0]?.message ?? "";
    const lines = message.trimEnd().split("\n");
    expect(lines.filter((line) => line.startsWith("Koklo-Ops:"))).toEqual([`Koklo-Ops: ${id}`]);
    expect(lines.filter((line) => /^Co-authored-by:/i.test(line))).toHaveLength(1);
    expect(message).not.toContain(forged);
  });

  it("utilisateur supprimé : pas de ligne Co-authored-by, le lot reste valide", async () => {
    const scene = await bench.scene();
    await bench.query("DELETE FROM users WHERE id = $1", [scene.userId]);

    const { id, row } = await run(scene, {
      operations: [
        { kind: "feature.create", specId: "F-001", payload: createPayload("Orpheline") },
      ],
    });

    expect(row.status).toBe("committed");
    const message = (await bench.commits(scene))[0]?.message ?? "";
    expect(message).toContain(`Koklo-Ops: ${id}`);
    expect(message).not.toContain("Co-authored-by");
  });
});
