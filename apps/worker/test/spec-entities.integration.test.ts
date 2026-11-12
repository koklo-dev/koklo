import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetBench, runReconcile } from "./support/reconcile-bench.ts";
import { clearRepos } from "./support/reconcile-heads-bench.ts";
import { endpointYaml, featureMd, featurePath, tableYaml } from "./support/spec-files.ts";
import { WebhookBench, type WebhookScene } from "./support/webhook-bench.ts";

/**
 * TK-100 lot B (B11, B325 b, c, g) : index d'entités générique. Un commit écrit une ligne `spec_entities` par élément du
 * modèle (fonctionnalité, règle, rôles, parcours JSON brut, table, endpoint), avec le hachage sha256 du contenu. Un
 * fichier de mise en page ou hors modèle n'est jamais indexé : modifier `_layout.yaml` ne change aucun hachage. Un snapshot
 * `ready` sans marqueur est réindexé par la réconciliation.
 */
let bench: WebhookBench;
let scene: WebhookScene;

const ROLES = `roles:
  - id: RL-visiteur
    nom: Visiteur
    description: Personne non connectée.
    permissions: [PM-compte.creer]
permissions:
  - id: PM-compte.creer
    action: creer
    ressource: T-user
    conditions:
      - L'email n'est pas déjà utilisé
    endpoints: [E-auth-register]
`;
const RULE = `---
id: R-003
type: contrainte
tables: [T-user]
endpoints: [E-auth-register]
---

## Énoncé
L'email d'un compte est unique.

## Exemples
- \`claire@example.org\` est déjà inscrit : refusé.
`;
const FLOW = JSON.stringify({ id: "P-001", titre: "Inscription", etapes: ["S-register"] });

const SPEC: Record<string, string> = {
  [featurePath("F-001", "inscription")]: featureMd("F-001", "Inscription", { criteria: ["Un"] }),
  [featurePath("F-002", "profil")]: featureMd("F-002", "Profil", { criteria: ["Deux"] }),
  "data/tables/T-user.yaml": tableYaml("T-user"),
  "api/endpoints/E-auth-register.yaml": endpointYaml("E-auth-register", "POST", "/auth/register"),
  "domain/rules/R-003-email-unique.md": RULE,
  "domain/roles.yaml": ROLES,
  "design/flows/P-001-inscription.json": FLOW,
  "design/flows/_layout.yaml": "positions:\n  P-001: { x: 10, y: 20 }\n",
  "features/_layout.yaml": "ordre: [F-002, F-001]\n",
};

type EntityRow = {
  kind: string;
  spec_id: string;
  zone: string | null;
  path: string;
  content_hash: string;
  sort: number;
};

const entities = (snapshotId: string | undefined) =>
  bench.query<EntityRow>(
    `SELECT kind, spec_id, zone, path, content_hash, sort FROM spec_entities
     WHERE snapshot_id = $1 ORDER BY kind, sort, spec_id`,
    [snapshotId],
  );
const hashes = async (snapshotId: string | undefined) =>
  Object.fromEntries(
    (await entities(snapshotId)).map((r) => [`${r.kind}:${r.spec_id}`, r.content_hash]),
  );
const lastSnapshot = async () => (await bench.snapshots(scene)).at(-1);

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

describe("zone d'une fonctionnalité (TK-102)", () => {
  it("une fonctionnalité qui porte une zone est indexée sans erreur (TK-102)", async () => {
    await bench.push(scene, {
      after: await bench.commit(scene, {
        [featurePath("F-001", "inscription")]: featureMd("F-001", "Inscription", {
          zone: "Authentification",
          criteria: ["Un"],
        }),
      }),
    });

    const snapshot = await lastSnapshot();
    expect(snapshot?.status).toBe("ready");
    expect((await entities(snapshot?.id)).map((r) => `${r.kind}:${r.spec_id}`)).toEqual([
      "feature:F-001",
    ]);
  });
});

describe("index d'un commit", () => {
  it("une ligne par élément du modèle, zone, chemin, tri et hachage sha256 ; layout et hors modèle exclus", async () => {
    await bench.push(scene, { after: await bench.commit(scene, SPEC) });

    const rows = await entities((await lastSnapshot())?.id);

    expect(rows.map((r) => `${r.kind}:${r.spec_id}`)).toEqual([
      "endpoint:E-auth-register",
      "feature:F-001",
      "feature:F-002",
      "flow:P-001",
      "roles:roles",
      "rule:R-003",
      "table:T-user",
    ]);
    expect(rows.find((r) => r.spec_id === "F-002")).toMatchObject({
      zone: "functional",
      path: "features/F-002-profil.md",
      sort: 1,
    });
    expect(rows.find((r) => r.kind === "flow")).toMatchObject({
      zone: "functional",
      path: "design/flows/P-001-inscription.json",
    });
    expect(rows.find((r) => r.kind === "table")?.zone).toBe("data");
    for (const row of rows) expect(row.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows.some((r) => r.path.includes("_layout"))).toBe(false);
    const [marker] = await bench.query<{ entities_indexed_at: Date | null }>(
      "SELECT entities_indexed_at FROM spec_snapshots WHERE id = $1",
      [(await lastSnapshot())?.id],
    );
    expect(marker?.entities_indexed_at).toBeInstanceOf(Date);
  });

  it("un parcours illisible (JSON invalide) ou un doublon d'identifiant n'échoue jamais l'indexation", async () => {
    const head = await bench.commit(scene, {
      ...SPEC,
      "design/flows/P-002-casse.json": "{ pas du json",
      "design/flows/P-001-copie.json": FLOW,
    });
    const row = await bench.push(scene, { after: head });

    expect(row).toMatchObject({ status: "processed" });
    const flows = (await entities((await lastSnapshot())?.id)).filter((r) => r.kind === "flow");
    expect(flows.map((r) => r.spec_id)).toEqual(["P-001"]);
  });
});

describe("hachage du contenu (B11)", () => {
  it("un commit sur _layout.yaml ne change aucun hachage", async () => {
    await bench.push(scene, { after: await bench.commit(scene, SPEC) });
    const before = await hashes((await lastSnapshot())?.id);

    await bench.push(scene, {
      after: await bench.commit(scene, {
        "design/flows/_layout.yaml": "positions:\n  P-001: { x: 99, y: 99 }\n",
        "features/_layout.yaml": "ordre: [F-001, F-002]\n",
      }),
    });

    expect(await bench.snapshots(scene)).toHaveLength(2);
    expect(await hashes((await lastSnapshot())?.id)).toEqual(before);
  });

  it("modifier un élément ne change que son hachage ; le contenu identique redonne le même", async () => {
    await bench.push(scene, { after: await bench.commit(scene, SPEC) });
    const before = await hashes((await lastSnapshot())?.id);

    await bench.push(scene, {
      after: await bench.commit(scene, {
        [featurePath("F-001", "inscription")]: featureMd("F-001", "Inscription modifiée", {
          criteria: ["Un"],
        }),
      }),
    });

    const after = await hashes((await lastSnapshot())?.id);
    const changed = Object.keys(after).filter((key) => after[key] !== before[key]);
    expect(changed).toEqual(["feature:F-001"]);
  });

  it("le parcours est haché sur son contenu JSON, indépendamment de la mise en forme", async () => {
    await bench.push(scene, { after: await bench.commit(scene, SPEC) });
    const before = (await hashes((await lastSnapshot())?.id))["flow:P-001"];

    await bench.push(scene, {
      after: await bench.commit(scene, {
        "design/flows/P-001-inscription.json": JSON.stringify(JSON.parse(FLOW), null, 4),
      }),
    });

    expect((await hashes((await lastSnapshot())?.id))["flow:P-001"]).toBe(before);
  });
});

describe("réindexation", () => {
  it("rejouer un commit déjà indexé remplace les entités sans doublon", async () => {
    const head = await bench.commit(scene, SPEC);
    await bench.push(scene, { after: head });
    await bench.push(scene, { after: head });

    expect(await entities((await lastSnapshot())?.id)).toHaveLength(7);
    expect(await bench.snapshots(scene)).toHaveLength(1);
  });

  it("la réconciliation réindexe un snapshot ready sans marqueur (antérieur à TK-100)", async () => {
    await bench.push(scene, { after: await bench.commit(scene, SPEC) });
    const id = (await lastSnapshot())?.id;
    await bench.query("DELETE FROM spec_entities WHERE snapshot_id = $1", [id]);
    await bench.query("UPDATE spec_snapshots SET entities_indexed_at = NULL WHERE id = $1", [id]);

    await runReconcile(bench);

    expect(await entities(id)).toHaveLength(7);
    const [marker] = await bench.query<{ entities_indexed_at: Date | null }>(
      "SELECT entities_indexed_at FROM spec_snapshots WHERE id = $1",
      [id],
    );
    expect(marker?.entities_indexed_at).toBeInstanceOf(Date);
  });
});
