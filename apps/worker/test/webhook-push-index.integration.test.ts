import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { endpointYaml, featureMd, featurePath, tableYaml } from "./support/spec-files.ts";
import { sha, WebhookBench, type WebhookScene } from "./support/webhook-bench.ts";

/**
 * TK-45b §5.3 : un `push` reconstruit l'index. Le job indexe la TÊTE COURANTE de la branche, lue à
 * l'exécution via le port (listFiles/readFile), jamais le `after` de la charge. Un snapshot par
 * commit (UNIQUE(repo_id, commit_sha)), `spec_heads(repo, branche)` déplacé vers lui, entités
 * indexées depuis les fichiers lus, jointures vers tables/endpoints SANS clé étrangère.
 */
let bench: WebhookBench;
let scene: WebhookScene;

const SPEC = {
  [featurePath("F-001", "inscription")]: featureMd("F-001", "Inscription", {
    priority: "must",
    criteria: ["Email déjà utilisé", "Mot de passe long"],
    tables: ["T-user"],
    endpoints: ["E-auth-register"],
  }),
  [featurePath("F-002", "profil")]: featureMd("F-002", "Profil", {
    priority: "could",
    criteria: ["Affichage"],
    tables: ["T-ghost"],
  }),
  "data/tables/T-user.yaml": tableYaml("T-user"),
  "api/endpoints/E-auth-register.yaml": endpointYaml("E-auth-register", "POST", "/auth/register"),
};

beforeAll(async () => {
  bench = await WebhookBench.create();
  await bench.start();
}, 240_000);
afterAll(async () => {
  await bench?.dispose();
});
beforeEach(async () => {
  scene = await bench.scene();
});

describe("entités indexées", () => {
  it("snapshot ready au SHA de tête, spec_heads déplacé, features et critères", async () => {
    const head = await bench.commit(scene, SPEC);

    const row = await bench.push(scene, { after: head });

    expect(row).toMatchObject({ status: "processed", error_code: null });
    const [snapshot] = await bench.snapshots(scene);
    expect(snapshot).toMatchObject({ commit_sha: head, status: "ready", error_code: null });
    expect(await bench.headSha(scene)).toBe(head);
    expect(
      await bench.query(
        "SELECT spec_id, title, status, priority, file_path FROM spec_features WHERE snapshot_id = $1 ORDER BY spec_id",
        [snapshot?.id],
      ),
    ).toEqual([
      {
        spec_id: "F-001",
        title: "Inscription",
        status: "specifiee",
        priority: "must",
        file_path: "features/F-001-inscription.md",
      },
      {
        spec_id: "F-002",
        title: "Profil",
        status: "specifiee",
        priority: "could",
        file_path: "features/F-002-profil.md",
      },
    ]);
    expect(
      await bench.query(
        `SELECT c.spec_id, c.position, c.title FROM spec_criteria c JOIN spec_features f ON f.id = c.feature_id
         WHERE f.snapshot_id = $1 AND f.spec_id = 'F-001' ORDER BY c.position`,
        [snapshot?.id],
      ),
    ).toEqual([
      { spec_id: "AC-1", position: 1, title: "Email déjà utilisé" },
      { spec_id: "AC-2", position: 2, title: "Mot de passe long" },
    ]);
  });
});

describe("entités indexées (tables, endpoints, jointures)", () => {
  it("tables, endpoints et jointures (la cible T-ghost n'existe pas : aucune clé étrangère)", async () => {
    const head = await bench.commit(scene, SPEC);
    await bench.push(scene, { after: head });
    const [snapshot] = await bench.snapshots(scene);

    expect(
      await bench.query("SELECT spec_id, file_path FROM spec_tables WHERE snapshot_id = $1", [
        snapshot?.id,
      ]),
    ).toEqual([{ spec_id: "T-user", file_path: "data/tables/T-user.yaml" }]);
    expect(
      await bench.query(
        "SELECT spec_id, method, path, file_path FROM spec_endpoints WHERE snapshot_id = $1",
        [snapshot?.id],
      ),
    ).toEqual([
      {
        spec_id: "E-auth-register",
        method: "POST",
        path: "/auth/register",
        file_path: "api/endpoints/E-auth-register.yaml",
      },
    ]);
    const links = (table: string) =>
      bench.query(
        `SELECT f.spec_id AS feature, l.target_spec_id AS target FROM ${table} l
         JOIN spec_features f ON f.id = l.feature_id WHERE f.snapshot_id = $1 ORDER BY 1, 2`,
        [snapshot?.id],
      );
    expect(await links("spec_feature_tables")).toEqual([
      { feature: "F-001", target: "T-user" },
      { feature: "F-002", target: "T-ghost" },
    ]);
    expect(await links("spec_feature_endpoints")).toEqual([
      { feature: "F-001", target: "E-auth-register" },
    ]);
  });
});

describe("entités indexées (monorepo)", () => {
  it("spec dans un monorepo : chemins relatifs à la racine de la spec (spec_path retiré)", async () => {
    const mono = await bench.scene({ specPath: "spec" });
    const head = await bench.commit(mono, SPEC);

    await bench.push(mono, { after: head });

    const [snapshot] = await bench.snapshots(mono);
    expect(snapshot).toMatchObject({ commit_sha: head, status: "ready" });
    const paths = await bench.query<{ file_path: string }>(
      "SELECT file_path FROM spec_features WHERE snapshot_id = $1 ORDER BY spec_id",
      [snapshot?.id],
    );
    expect(paths.map((row) => row.file_path)).toEqual([
      "features/F-001-inscription.md",
      "features/F-002-profil.md",
    ]);
  });
});

describe("la tête est lue à l'exécution, pas le `after` de la charge", () => {
  it("un `after` périmé ou inconnu n'est jamais indexé : le snapshot porte la tête réelle", async () => {
    const head = await bench.commit(scene, SPEC);
    bench.spy.reset();

    await bench.push(scene, { after: sha(7), before: sha(6) });

    expect((await bench.snapshots(scene)).map((row) => row.commit_sha)).toEqual([head]);
    expect(await bench.headSha(scene)).toBe(head);
    const [listing] = bench.spy.callsOf("listFiles");
    expect(listing?.request.ref).toBe("cadrage");
  });

  it("le contenu indexé est celui de la tête lue, même si le push annonçait un commit plus ancien", async () => {
    const first = await bench.commit(scene, SPEC);
    const second = await bench.commit(scene, {
      [featurePath("F-003", "nouveau")]: featureMd("F-003", "Nouveau", { criteria: ["Un"] }),
    });

    await bench.push(scene, { after: first });

    const [snapshot] = await bench.snapshots(scene);
    expect(snapshot?.commit_sha).toBe(second);
    expect(await bench.featureIds(snapshot?.id ?? "")).toEqual(["F-001", "F-002", "F-003"]);
  });
});

describe("snapshot par commit, idempotent", () => {
  it("deux livraisons pour la même tête : un snapshot, des entités une seule fois, une seule lecture", async () => {
    const head = await bench.commit(scene, SPEC);
    await bench.push(scene, { after: head });
    const reads = bench.spy.callsOf("readFile").length;

    const second = await bench.push(scene, { after: head });

    expect(second.status).toBe("processed");
    expect(await bench.snapshots(scene)).toHaveLength(1);
    expect(bench.spy.callsOf("readFile")).toHaveLength(reads);
    const [count] = await bench.query<{ n: string }>(
      "SELECT count(*) AS n FROM spec_features f JOIN spec_snapshots s ON s.id = f.snapshot_id WHERE s.repo_id = $1",
      [scene.repoId],
    );
    expect(count?.n).toBe("2");
  });

  it("un snapshot resté en building est reconstruit : ready, entités périmées purgées, sans doublon", async () => {
    const head = await bench.commit(scene, SPEC);
    const snapshotId = randomUUID();
    await bench.query(
      `INSERT INTO spec_snapshots (id, organization_id, repo_id, commit_sha, status, indexed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'building', now(), now(), now())`,
      [snapshotId, scene.organizationId, scene.repoId, head],
    );
    await bench.query(
      `INSERT INTO spec_features (id, organization_id, snapshot_id, spec_id, title, status, priority, file_path, created_at, updated_at)
       VALUES ($1, $2, $3, 'F-099', 'Périmée', 'brouillon', 'must', 'features/F-099-x.md', now(), now())`,
      [randomUUID(), scene.organizationId, snapshotId],
    );

    await bench.push(scene, { after: head });

    expect(await bench.snapshots(scene)).toMatchObject([
      { id: snapshotId, commit_sha: head, status: "ready", error_code: null },
    ]);
    expect(await bench.featureIds(snapshotId)).toEqual(["F-001", "F-002"]);
  });
});
