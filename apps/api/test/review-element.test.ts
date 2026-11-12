import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createReviewScene,
  P1_FEATURES,
  type ReviewScene,
  reviewApi,
  reviewRows,
} from "./helpers/reviews.ts";
import { deliverablesApi } from "./helpers/spec-deliverables.ts";
import { type EntitySeed, entity, featureEntities, seedIndex } from "./helpers/spec-read.ts";

/**
 * TK-100 lot B (B11, B325 b, c, d) : validation par élément et par bloc, sur le hachage du contenu. Modifier un élément
 * invalide sa validation, un bloc invalide le bloc, un commit sur un autre élément ou sur `_layout.yaml` (mêmes hachages,
 * autre SHA) n'invalide rien. Le statut « Validé » du livrable est calculé. SHA, auteur, décision et commentaire sont
 * enregistrés avec le hachage (`review_versions`).
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;

const RULES = [entity("rule", "R-001", "a"), entity("rule", "R-002", "a")];
const BASE: EntitySeed[] = [
  ...featureEntities(P1_FEATURES),
  ...RULES,
  entity("roles", "roles", "a"),
  entity("flow", "P-001", "a"),
  entity("table", "T-user", "a"),
];
const replaced = (entities: EntitySeed[], next: EntitySeed) =>
  entities.map((e) => (e.kind === next.kind && e.specId === next.specId ? next : e));

const p1 = () => scene.p1.projectId;
const as = (role: "owner" | "admin" | "dev" | "designer" | "business" | "client") =>
  reviewApi(bench().app, scene.p1.world.actors[role]);
const client = () => reviewApi(bench().app, scene.c1);
const head = async (entities: EntitySeed[]) =>
  (await seedIndex(bench(), scene.p1, P1_FEATURES, { commit: true, entities })).sha;
const deliverable = async (key: string) => {
  const res = await deliverablesApi(bench().app, scene.p1.world.actors.owner).list(p1());
  return (res.body.deliverables as { key: string; status: string }[]).find((d) => d.key === key);
};
const listed = async () =>
  (await as("owner").list(p1())).body.items as {
    targetKind: string;
    targetRef: string;
    current: boolean;
    onBehalf: boolean;
    authorRole: string;
  }[];
const approveAll = async (version: string) => {
  const api = client();
  for (const [targetKind, targetRef] of [
    ["feature", "F-001"],
    ["feature", "F-002"],
    ["flow", "P-001"],
    ["rules", "rules"],
    ["roles", "roles"],
  ] as const) {
    const res = await api.submit(p1(), version, { targetKind, targetRef });
    expect(res.status, `${targetKind} ${targetRef} : ${JSON.stringify(res.body)}`).toBe(200);
  }
};

beforeEach(async () => {
  scene = await createReviewScene(bench());
});

describe("enregistrement : SHA, auteur, décision, commentaire et hachage du contenu", () => {
  it("une validation d'élément écrit la review et sa ligne review_versions au hachage de l'élément", async () => {
    const version = await head(BASE);

    const res = await client().submit(p1(), version, { comment: "Parfait" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const [row] = await reviewRows(bench().database, p1());
    expect(row).toMatchObject({
      sha: version,
      status: "approved",
      author_role: "client",
      comment: "Parfait",
      target_kind: "feature",
    });
    const [saved] = await bench().database.query<{ content_hash: string }>(
      "SELECT content_hash FROM review_versions WHERE review_id = $1",
      [row?.id],
    );
    expect(saved?.content_hash).toBe(featureEntities(P1_FEATURES)[0]?.hash);
  });

  it.each([
    ["flow", "P-001"],
    ["rules", "rules"],
    ["roles", "roles"],
    ["deliverable", "functional"],
    ["deliverable", "data"],
  ] as const)(
    "cible %s %s : validée, enregistrée avec un hachage",
    async (targetKind, targetRef) => {
      const version = await head(BASE);
      const role = targetRef === "data" ? "dev" : "client";
      // TK-104 (B351) : « Valider le cahier » exige que toutes les unités soient traitées.
      if (targetRef === "functional") await approveAll(version);

      const res = await as(role).submit(p1(), version, { targetKind, targetRef });

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const rows = await bench().database.query<{ content_hash: string }>(
        `SELECT v.content_hash FROM review_versions v JOIN reviews r ON r.id = v.review_id
          WHERE r.project_id = $1 AND r.target_kind = $2::review_target_kind`,
        [p1(), targetKind],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.content_hash).toMatch(/^[0-9a-f]{64}$/);
    },
  );
});

describe("cibles absentes de la tête", () => {
  it("cible inexistante dans la tête : 404 uniforme, rien d'écrit (parcours, livrable sans entité, bloc sans règle)", async () => {
    const version = await head(BASE.filter((e) => e.kind !== "rule"));

    for (const [targetKind, targetRef] of [
      ["flow", "P-009"],
      ["rules", "rules"],
    ] as const) {
      expect(
        (await client().submit(p1(), version, { targetKind, targetRef })).status,
        targetKind,
      ).toBe(404);
    }
    const owner = as("owner");
    await bench().database.query("DELETE FROM project_client_access WHERE project_id = $1", [p1()]);
    expect(
      (await owner.submit(p1(), version, { targetKind: "deliverable", targetRef: "architecture" }))
        .status,
    ).toBe(404);
    expect(await reviewRows(bench().database, p1())).toHaveLength(0);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("invalidation (B11)", () => {
  it("modifier un élément invalide sa validation ; le livrable n'est plus validé", async () => {
    await approveAll(await head(BASE));
    expect((await deliverable("functional"))?.status).toBe("validated");

    await head(replaced(BASE, { ...BASE[0], hash: "f".repeat(64) } as EntitySeed));

    expect((await deliverable("functional"))?.status).toBe("pending");
    const items = await listed();
    expect(items.find((i) => i.targetRef === "F-001")?.current).toBe(false);
    expect(items.find((i) => i.targetRef === "F-002")?.current).toBe(true);
  });

  it("un commit sur un autre élément n'invalide pas la validation de F-001", async () => {
    const first = await head(BASE);
    await client().submit(p1(), first, { targetRef: "F-001" });

    await head(replaced(BASE, { ...BASE[1], hash: "e".repeat(64) } as EntitySeed));

    const items = await listed();
    expect(items.find((i) => i.targetRef === "F-001")?.current).toBe(true);
  });

  it("un commit de mise en page (mêmes hachages, autre SHA) n'invalide rien : le livrable reste Validé", async () => {
    await approveAll(await head(BASE));

    await head(BASE);

    expect((await deliverable("functional"))?.status).toBe("validated");
    for (const item of await listed()) expect(item.current, item.targetRef).toBe(true);
  });

  it("le bloc des règles : modifier une règle l'invalide, modifier une fonctionnalité non", async () => {
    await approveAll(await head(BASE));

    await head(replaced(BASE, { ...BASE[0], hash: "d".repeat(64) } as EntitySeed));
    expect((await listed()).find((i) => i.targetKind === "rules")?.current).toBe(true);

    await head(replaced(BASE, entity("rule", "R-002", "modifiée")));
    expect((await listed()).find((i) => i.targetKind === "rules")?.current).toBe(false);
  });

  it("le livrable entier : valide tant qu'aucun de ses éléments ne change", async () => {
    const owner = as("owner");
    await bench().database.query("DELETE FROM project_client_access WHERE project_id = $1", [p1()]);
    const version = await head(BASE);
    for (const [targetKind, targetRef] of [
      ["feature", "F-001"],
      ["feature", "F-002"],
      ["flow", "P-001"],
      ["rules", "rules"],
      ["roles", "roles"],
    ] as const) {
      expect((await owner.submit(p1(), version, { targetKind, targetRef })).status).toBe(200);
    }
    expect(
      (await owner.submit(p1(), version, { targetKind: "deliverable", targetRef: "functional" }))
        .status,
    ).toBe(200);
    expect((await deliverable("functional"))?.status).toBe("validated");

    await head(replaced(BASE, entity("flow", "P-001", "modifié")));

    expect((await deliverable("functional"))?.status).toBe("pending");
  });
});

describe("statut du livrable calculé", () => {
  it("À valider tant que tout n'est pas posé, Validé quand tout est validé sur le contenu courant", async () => {
    const version = await head(BASE);
    expect((await deliverable("functional"))?.status).toBe("pending");
    await client().submit(p1(), version, { targetRef: "F-001" });
    expect((await deliverable("functional"))?.status).toBe("pending");

    await approveAll(version);

    expect((await deliverable("functional"))?.status).toBe("validated");
    const res = await deliverablesApi(bench().app, scene.p1.world.actors.owner).list(p1());
    expect(res.body.validatedCount).toBe(1);
  });

  it("À revoir quand une demande de changement est la dernière review d'une cible", async () => {
    const version = await head(BASE);
    await approveAll(version);

    await client().submit(p1(), version, { targetRef: "F-002", status: "changes_requested" });

    expect((await deliverable("functional"))?.status).toBe("revise");
  });

  it("À faire sans entité ; Données À valider dès qu'une table est indexée, sans validation possible par le client", async () => {
    await head(BASE.filter((e) => e.kind === "feature"));
    expect((await deliverable("data"))?.status).toBe("todo");
    await head(BASE);
    expect((await deliverable("data"))?.status).toBe("pending");
    expect((await deliverable("architecture"))?.status).toBe("todo");
  });
});
