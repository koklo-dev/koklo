import { parseRuleMarkdown, parseSpecFiles } from "@koklo/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPayload, type Scene, WorkerBench } from "./support/spec-write-bench.ts";

/**
 * TK-103 lot A (B339) : le job `spec-write` écrit règles, rôles et parcours (pg-boss réel, Postgres éphémère, faux
 * fournisseur) : un commit, `R-nnn-<slug>.md`, `roles.yaml` fusionné sans écrasement (deux lots concurrents gardent les deux
 * rôles), `P-<slug>.yaml`, collision d'identifiant en `write_conflict`.
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

async function run(scene: Scene, input: Parameters<WorkerBench["insertBatch"]>[1]) {
  const id = await bench.insertBatch(scene, input);
  await bench.enqueue(scene, id, input.branch);
  return { id, row: await bench.settled(id) };
}
const role = (name: string) => ({
  kind: "role.create",
  specId: `RL-${name}`,
  payload: { name, description: `Rôle ${name}`, permissions: [{ id: "PM-agenda.lire" }] },
});

describe("règles", () => {
  it("rule.create, rule.update puis rule.delete : trois commits, le fichier suit", async () => {
    const scene = await bench.scene();
    const created = await run(scene, {
      operations: [
        {
          kind: "rule.create",
          specId: "R-001",
          payload: {
            title: "Délai de rétractation",
            type: "contrainte",
            statement: "Quatorze jours.",
          },
        },
      ],
    });
    expect(created.row.status).toBe("committed");
    const path = "domain/rules/R-001-delai-de-retractation.md";
    expect(await bench.files(scene)).toContain(path);
    const parsed = parseRuleMarkdown(path, (await bench.read(scene, path)).content);
    expect(parsed).toMatchObject({
      ok: true,
      value: { id: "R-001", titre: "Délai de rétractation" },
    });

    const updated = await run(scene, {
      operations: [
        { kind: "rule.update", specId: "R-001", payload: { statement: "Trente jours." } },
      ],
    });
    expect(updated.row.status).toBe("committed");
    expect((await bench.read(scene, path)).content).toContain("Trente jours.");

    const deleted = await run(scene, { operations: [{ kind: "rule.delete", specId: "R-001" }] });
    expect(deleted.row.status).toBe("committed");
    expect(await bench.files(scene)).not.toContain(path);
  });

  it("collision d'identifiant : write_conflict, aucun commit", async () => {
    const scene = await bench.scene();
    const payload = { title: "Délai", type: "calcul", statement: "x" };
    await run(scene, { operations: [{ kind: "rule.create", specId: "R-001", payload }] });
    const before = (await bench.commits(scene, "cadrage", 1))[0]?.sha;
    const second = await run(scene, {
      operations: [{ kind: "rule.create", specId: "R-001", payload }],
    });
    expect(second.row).toMatchObject({ status: "conflict", error_code: "write_conflict" });
    expect((await bench.commits(scene, "cadrage", 1))[0]?.sha).toBe(before);
  });
});

describe("rôles", () => {
  it("deux lots concurrents sur deux rôles gardent les deux dans roles.yaml", async () => {
    const scene = await bench.scene();
    const [one, two] = await Promise.all([
      bench.insertBatch(scene, { operations: [role("un")] }),
      bench.insertBatch(scene, { operations: [role("deux")] }),
    ]);
    await Promise.all([bench.enqueue(scene, one), bench.enqueue(scene, two)]);
    const rows = await Promise.all([bench.settled(one), bench.settled(two)]);
    expect(rows.map((row) => row.status)).toEqual(["committed", "committed"]);
    const file = parseSpecFiles([
      {
        path: "domain/roles.yaml",
        content: (await bench.read(scene, "domain/roles.yaml")).content,
      },
    ]).spec.roles[0]?.value;
    expect(file?.roles.map((r) => r.id).sort()).toEqual(["RL-deux", "RL-un"]);
    expect(file?.permissions.map((p) => p.id)).toEqual(["PM-agenda.lire"]);
  });

  it("un rôle de même identifiant : write_conflict", async () => {
    const scene = await bench.scene();
    await run(scene, { operations: [role("un")] });
    const again = await run(scene, { operations: [role("un")] });
    expect(again.row).toMatchObject({ status: "conflict", error_code: "write_conflict" });
  });

  it("le designer ne crée pas de rôle : FORBIDDEN", async () => {
    const scene = await bench.scene();
    const { row } = await run(scene, { operations: [role("un")], authorRole: "designer" });
    expect(row).toMatchObject({ status: "failed", error_code: "FORBIDDEN" });
  });
});

describe("parcours", () => {
  const flow = {
    kind: "flow.create",
    specId: "P-inscription",
    payload: {
      title: "Inscription",
      actor: "Visiteur",
      start: { label: "Ouvrir la page" },
      steps: [{ label: "Remplir" }],
    },
  };

  it("flow.create écrit design/flows/P-inscription.yaml, y compris pour le designer ; collision : write_conflict", async () => {
    const scene = await bench.scene();
    const { row } = await run(scene, { operations: [flow], authorRole: "designer" });
    expect(row.status).toBe("committed");
    expect((await bench.read(scene, "design/flows/P-inscription.yaml")).content).toContain(
      "acteur: Visiteur",
    );
    const again = await run(scene, { operations: [flow] });
    expect(again.row).toMatchObject({ status: "conflict", error_code: "write_conflict" });
  });

  it("une opération de règle reste distincte d'une feature : un lot mixte écrit les deux fichiers en un commit", async () => {
    const scene = await bench.scene();
    const { row } = await run(scene, {
      operations: [
        { kind: "feature.create", specId: "F-001", payload: createPayload("Réserver") },
        {
          kind: "rule.create",
          specId: "R-001",
          payload: { title: "Délai", type: "contrainte", statement: "x", features: ["F-001"] },
        },
      ],
    });
    expect(row.status).toBe("committed");
    const files = await bench.files(scene);
    expect(files).toEqual(
      expect.arrayContaining(["features/F-001-reserver.md", "domain/rules/R-001-delai.md"]),
    );
  });
});

/** TK-115 (B719 à B724) : le cahier technique par le job réel ; une valeur de secret met le lot en échec sans commit. */
describe("cahier technique", () => {
  const stack = {
    kind: "stack.create",
    specId: "ST-base",
    payload: { role: "Base", status: "open", options: ["A", "B"], why: "Fiable." },
  };

  it("choix, environnement et section du cahier : un seul commit, fichiers sous tech/", async () => {
    const scene = await bench.scene();
    const { row } = await run(scene, {
      operations: [
        stack,
        {
          kind: "env.create",
          specId: "ENV-recette",
          payload: {
            name: "Recette",
            address: "recette.exemple.fr",
            hosting: "Paris",
            database: "PostgreSQL",
            data: "sample",
          },
        },
        {
          kind: "doc.section.create",
          specId: "DOC-conventions",
          payload: { deliverable: "technical", title: "Conventions", markdown: "Règles." },
        },
      ],
    });
    expect(row.status, JSON.stringify(row)).toBe("committed");
    expect(await bench.files(scene)).toEqual(
      expect.arrayContaining([
        "tech/stack/base.yaml",
        "tech/environments.yaml",
        expect.stringMatching(/^tech\/cahier-technique\/\d{2}-conventions\.md$/),
      ]),
    );
  });

  it("valeur de secret : lot failed SPEC_INVALID (SECRET_VALUE), aucun commit, valeur absente du rapport", async () => {
    const scene = await bench.scene();
    const secret = `ghp_${"x".repeat(36)}`;
    const before = await bench.files(scene);
    const { row } = await run(scene, {
      operations: [{ ...stack, payload: { ...stack.payload, why: secret } }],
    });
    expect(row).toMatchObject({ status: "failed", error_code: "SPEC_INVALID" });
    expect(JSON.stringify(row)).toContain("SECRET_VALUE");
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(await bench.files(scene)).toEqual(before);
    expect(row.commit_sha).toBeNull();
  });
});
