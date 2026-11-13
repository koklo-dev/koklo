import { emitFeatureMarkdown } from "@koklo/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BOT, type Scene, WorkerBench } from "./support/spec-write-bench.ts";

/**
 * TK-106 lot B (cas 9 et 10) : la migration v1 -> v2 est UN lot du bot sur la branche de travail (jamais la branche par
 * défaut), tout ou rien ; `spec.migrate.revert` rend exactement l'arbre d'origine ou refuse (`write_conflict`).
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

const FEATURE = emitFeatureMarkdown({
  id: "F-001",
  titre: "Comptes",
  statut: "brouillon",
  priorite: "should",
  tables: ["T-user"],
  endpoints: ["E-users-list"],
  ecrans: [],
  roles: [],
  regles: [],
  nfr: [],
  description: "",
  criteres: [],
});
const V1_FILES: Record<string, string> = {
  "features/F-001-comptes.md": FEATURE,
  "data/tables/T-user.yaml":
    "id: T-user\nchamps:\n  - { nom: id, type: uuid, nullable: false, unique: true }\n  - { nom: email, type: text, nullable: false, unique: true }\n",
  "api/endpoints/E-users-list.yaml":
    "id: E-users-list\nmethode: GET\nchemin: /users\ntables: [T-user]\n",
  ".koklo/rules.yaml": "version: 1\n",
};

async function seedV1(scene: Scene) {
  const auth = await bench.spy.auth(scene.owner);
  await bench.spy.inner.writeCommit({
    auth,
    repo: scene.ref,
    branch: "cadrage",
    author: BOT,
    message: "test: départ v1",
    files: Object.entries(V1_FILES).map(([path, content]) => ({ path, content })),
  });
}

async function snapshot(scene: Scene, branch = "cadrage"): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const path of await bench.files(scene, branch)) {
    out[path] = (await bench.read(scene, path, branch)).content;
  }
  return out;
}

async function run(scene: Scene, kind: string, payload: Record<string, unknown> = {}) {
  const id = await bench.insertBatch(scene, {
    operations: [{ kind, payload }],
    authorRole: "owner",
  });
  await bench.enqueue(scene, id);
  return { id, row: await bench.settled(id) };
}

describe("spec.migrate : un lot du bot", () => {
  it("UN commit sur cadrage, auteur Koklo, trailer Koklo-Ops, rien sur la branche par défaut", async () => {
    const scene = await bench.scene();
    await seedV1(scene);
    const mainBefore = await snapshot(scene, "main");
    bench.spy.reset();

    const { id, row } = await run(scene, "spec.migrate");

    expect(row.status).toBe("committed");
    expect(bench.spy.callsOf("writeCommit")).toHaveLength(1);
    const [head] = await bench.commits(scene);
    expect(head?.message.split("\n")[0]).toBe("spec: migration vers le format v2");
    expect(head?.message).toContain(`Koklo-Ops: ${id}`);
    expect(head?.author.name).toBe(BOT.name);
    const after = await snapshot(scene);
    expect(after["koklo.project.yaml"]).toContain("spec_version: 2");
    expect(after["data/tables/user.yaml"]).toContain("id: T-user");
    expect(after["api/endpoints/users.lister.yaml"]).toContain("id: users.lister");
    expect(after["features/F-001-comptes.md"]).toContain("endpoints: [users.lister]");
    expect(after["design/rules.yaml"]).toBe("version: 1\n");
    expect(after["data/tables/T-user.yaml"]).toBeUndefined();
    expect(await snapshot(scene, "main")).toEqual(mainBefore);
  });

  it("une erreur : aucun commit, lot failed SPEC_INVALID avec rapport", async () => {
    const scene = await bench.scene();
    await seedV1(scene);
    await run(scene, "spec.migrate");
    bench.spy.reset();

    const { row } = await run(scene, "spec.migrate");

    expect(row.status).toBe("failed");
    expect(row.error_code).toBe("SPEC_INVALID");
    expect(row.report?.issues[0]?.code).toBe("STRUCT_MIGRATION_ALREADY_V2");
    expect(bench.spy.callsOf("writeCommit")).toHaveLength(0);
  });
});

describe("spec.migrate.revert : retour arrière", () => {
  it("rend exactement l'arbre d'origine, en un commit", async () => {
    const scene = await bench.scene();
    await seedV1(scene);
    const original = await snapshot(scene);
    const migrated = await run(scene, "spec.migrate");
    bench.spy.reset();

    const { row } = await run(scene, "spec.migrate.revert", { migrationBatchId: migrated.id });

    expect(row.status).toBe("committed");
    expect(bench.spy.callsOf("writeCommit")).toHaveLength(1);
    expect(await snapshot(scene)).toEqual(original);
    const [head] = await bench.commits(scene);
    expect(head?.message.split("\n")[0]).toBe("spec: retour arrière de la migration v2");
  });

  it("un fichier modifié depuis la migration : write_conflict, aucun commit", async () => {
    const scene = await bench.scene();
    await seedV1(scene);
    const migrated = await run(scene, "spec.migrate");
    const auth = await bench.spy.auth(scene.owner);
    const edited = `${(await bench.read(scene, "data/tables/user.yaml")).content}# édité\n`;
    await bench.spy.inner.writeCommit({
      auth,
      repo: scene.ref,
      branch: "cadrage",
      author: BOT,
      message: "test: édition",
      files: [{ path: "data/tables/user.yaml", content: edited }],
    });
    bench.spy.reset();

    const { row } = await run(scene, "spec.migrate.revert", { migrationBatchId: migrated.id });

    expect(row.status).toBe("conflict");
    expect(row.error_code).toBe("write_conflict");
    expect(bench.spy.callsOf("writeCommit")).toHaveLength(0);
  });
});
