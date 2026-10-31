import { GitProviderUnavailableError } from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { endpointYaml, featureMd, featurePath, tableYaml } from "./support/spec-files.ts";
import { WebhookBench, type WebhookScene } from "./support/webhook-bench.ts";

/**
 * TK-45b §5.3 : spec invalide ou incohérente, relevé du compteur `feature` (raiseCounterTo),
 * atomicité de l'écriture de l'index, aucun appel réseau dans une transaction, aucune fuite
 * (journaux, secrets, charge complète).
 */
let bench: WebhookBench;
let scene: WebhookScene;

const feature = (n: number | string, over = {}) => ({
  [featurePath(`F-${n}`, "x")]: featureMd(`F-${n}`, `Feature ${n}`, { criteria: ["Un"], ...over }),
});

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

const indexed = async () => {
  const [snapshot] = await bench.snapshots(scene);
  return { snapshot, ids: await bench.featureIds(snapshot?.id ?? "") };
};

describe("spec invalide ou incohérente : l'indexation ne plante pas", () => {
  it("entités invalides exclues, valides indexées, snapshot ready, livraison processed", async () => {
    await bench.commit(scene, {
      ...feature("001"),
      [featurePath("F-002", "bad")]: "---\nid: [\n---\n",
      "data/tables/T-bad.yaml": "id: [",
      "notes/ignore-me.txt": "pas un fichier de spec",
    });

    const row = await bench.push(scene);

    const { snapshot, ids } = await indexed();
    expect(row).toMatchObject({ status: "processed", error_code: null });
    expect(snapshot).toMatchObject({ status: "ready", error_code: null });
    expect(ids).toEqual(["F-001"]);
    expect(await bench.query("SELECT id FROM spec_tables")).toEqual([]);
  });

  it("références cassées et feature implémentée sans critère : indexées quand même", async () => {
    await bench.commit(scene, {
      ...feature("001", { tables: ["T-absente"], endpoints: ["E-absent"] }),
      [featurePath("F-002", "vide")]: featureMd("F-002", "Sans critère", { status: "implementee" }),
    });

    const row = await bench.push(scene);

    expect(row.status).toBe("processed");
    expect((await indexed()).ids).toEqual(["F-001", "F-002"]);
    expect(await bench.query("SELECT target_spec_id FROM spec_feature_tables")).toEqual([
      { target_spec_id: "T-absente" },
    ]);
  });

  it("dépôt sans aucune entité (manifeste seul) : snapshot ready, zéro feature", async () => {
    const row = await bench.push(scene);
    const { snapshot, ids } = await indexed();
    expect(row.status).toBe("processed");
    expect(snapshot?.status).toBe("ready");
    expect(ids).toEqual([]);
  });
});

describe("compteur feature (raiseCounterTo)", () => {
  it("F-020 poussé directement : compteur relevé à 20 ; ne baisse jamais ensuite", async () => {
    await bench.commit(scene, feature("020"));
    await bench.push(scene);
    expect(await bench.counter(scene)).toBe(20);

    await bench.commit(scene, feature("005"));
    await bench.push(scene);
    expect(await bench.counter(scene)).toBe(20);

    await bench.commit(scene, feature("021"));
    await bench.push(scene);
    expect(await bench.counter(scene)).toBe(21);
  });

  it("un compteur déjà plus haut n'est pas abaissé", async () => {
    await bench.query(
      `INSERT INTO project_counters (organization_id, project_id, name, last_value, created_at, updated_at)
       VALUES ($1, $2, 'feature', 50, now(), now())`,
      [scene.organizationId, scene.projectId],
    );
    await bench.commit(scene, feature("010"));
    await bench.push(scene);
    expect(await bench.counter(scene)).toBe(50);
  });

  it("les F-nnn au-dessus de 999 999 sont indexés mais ignorés du compteur", async () => {
    await bench.commit(scene, {
      ...feature("001"),
      ...feature("999999"),
      ...feature("1000000"),
      ...feature("9999999999"),
    });

    const row = await bench.push(scene);

    expect(row.status).toBe("processed");
    expect(await bench.counter(scene)).toBe(999_999);
    expect(new Set((await indexed()).ids)).toEqual(
      new Set(["F-001", "F-999999", "F-1000000", "F-9999999999"]),
    );
  });

  it("seul un identifiant énorme : le compteur n'est pas gonflé", async () => {
    await bench.commit(scene, feature("9999999999"));
    await bench.push(scene);
    expect((await bench.counter(scene)) ?? 0).toBe(0);
  });

  it("toutes branches confondues, et jamais le compteur d'un autre projet", async () => {
    const other = await bench.scene();
    await bench.commit(scene, feature("030"), "feat/c");

    await bench.push(scene, { branch: "feat/c", ref: "refs/heads/feat/c" });

    expect(await bench.counter(scene)).toBe(30);
    expect(await bench.counter(other)).toBeUndefined();
  });
});

describe("atomicité et réseau", () => {
  it("un échec en cours d'écriture ne laisse rien : ni snapshot, ni entités, ni tête, ni compteur", async () => {
    await bench.query(
      `CREATE FUNCTION test_block_endpoints() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'bloqué'; END $$`,
    );
    await bench.query(
      "CREATE TRIGGER test_block_endpoints BEFORE INSERT ON spec_endpoints FOR EACH ROW EXECUTE FUNCTION test_block_endpoints()",
    );
    try {
      await bench.commit(scene, {
        ...feature("020"),
        "api/endpoints/E-a.yaml": endpointYaml("E-a", "GET", "/a"),
        "data/tables/T-a.yaml": tableYaml("T-a"),
      });

      const row = await bench.push(scene);

      expect(row).toMatchObject({ status: "failed", error_code: "internal" });
      expect(await bench.snapshots(scene)).toEqual([]);
      expect(await bench.headSha(scene)).toBeUndefined();
      expect(await bench.counter(scene)).toBeUndefined();
      expect(
        await bench.query("SELECT id FROM spec_features WHERE organization_id = $1", [
          scene.organizationId,
        ]),
      ).toEqual([]);
      expect(
        await bench.query("SELECT id FROM spec_tables WHERE organization_id = $1", [
          scene.organizationId,
        ]),
      ).toEqual([]);
    } finally {
      await bench.query("DROP TRIGGER test_block_endpoints ON spec_endpoints");
      await bench.query("DROP FUNCTION test_block_endpoints()");
    }
  });

  it("aucun appel au fournisseur ne se fait dans une transaction de base ouverte", async () => {
    await bench.commit(scene, feature("001"));
    const open: number[] = [];
    const sample = async () => {
      const [row] = await bench.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_stat_activity
         WHERE datname = current_database() AND pid <> pg_backend_pid() AND state LIKE 'idle in transaction%'`,
      );
      open.push(row?.n ?? -1);
    };
    for (const method of ["authenticate", "listFiles", "readFile"]) {
      bench.spy.hooks.set(method, sample);
    }

    await bench.push(scene);

    expect(open.length).toBeGreaterThanOrEqual(3);
    expect(open.every((count) => count === 0)).toBe(true);
  });
});

describe("aucune fuite dans les journaux", () => {
  it("ni la charge complète, ni le jeton du fournisseur, ni le corps d'une erreur du fournisseur", async () => {
    const auth = await bench.spy.auth(scene.owner);
    const failure = Object.assign(new GitProviderUnavailableError({ operation: "listFiles" }), {
      cause: "canary-provider-body-91827",
    });
    bench.spy.failWith("listFiles", failure);
    const payload = bench.pushPayload(scene);
    const id = await bench.deliver(payload);
    await bench.settled(id);
    await bench.jobCompleted(id);

    const logs = bench.lines.join("\n");

    expect(logs).not.toContain("canary-provider-body-91827");
    expect(logs).not.toContain(JSON.stringify(payload));
    expect(logs).not.toContain(auth.token);
    expect(logs).toContain(id);
  });

  it("le login du compte d'une charge installation n'est pas journalisé", async () => {
    const payload = {
      ...bench.installationPayload(scene, "suspend"),
      account: { externalId: "77", login: "login-canary-4455", kind: "organization" as const },
    };
    await bench.settled(await bench.deliver(payload));
    expect(bench.lines.join("\n")).not.toContain("login-canary-4455");
  });
});
