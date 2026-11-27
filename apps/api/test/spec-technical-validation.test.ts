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
import { itemApi } from "./helpers/spec-items.ts";
import { type EntitySeed, entity, featureEntities, seedIndex } from "./helpers/spec-read.ts";
import { nfrEntity, operationEntity, stackEntity } from "./helpers/spec-technical.ts";

/**
 * TK-116 lot A (cas 6, B775, B776) : « Valider » le cahier technique. Refus `choices_open` tant qu'un choix de la tête est
 * à trancher (rien d'écrit) ; demande de modifications et retrait admis ; validé : Sécurité s'ouvre ; architecture modifiée :
 * À revoir, puis validé de nouveau à contenu égal.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
type Entry = { key: string; status: string; available: boolean };
type Role = "owner" | "admin" | "dev" | "designer" | "client";

const open = () => stackEntity("ST-sms");
const chosen = () => stackEntity("ST-sms", { statut: "choisi", choix: "Brevo" });

/** Index de la tête : Fonctionnel, Données, Architecture puis cahier technique ; `component` change le composant. */
const seeds = (stack: EntitySeed, component = "a"): EntitySeed[] => [
  ...featureEntities(P1_FEATURES),
  entity("rule", "R-004", "a"),
  entity("roles", "roles", "a"),
  entity("flow", "P-001", "a"),
  entity("table", "T-user", "a", { nom: "Utilisateur", champs: [] }),
  entity("component", "C-api", component, { id: "C-api", nom: "API", titre: "API" }),
  stack,
  operationEntity("reservation.create"),
  nfrEntity("NFR-001"),
];

const p1 = () => scene.p1.projectId;
const as = (role: Role) => reviewApi(bench().app, scene.p1.world.actors[role]);
const head = async (entities: EntitySeed[]) =>
  (await seedIndex(bench(), scene.p1, P1_FEATURES, { commit: true, entities })).sha;
const submit = (role: Role, version: string, key: string, over: Record<string, unknown> = {}) =>
  as(role).submit(p1(), version, { targetKind: "deliverable", targetRef: key, ...over });

/** Valide les amonts du cahier technique à la tête `version`. */
const validateUpstream = async (version: string) => {
  const client = reviewApi(bench().app, scene.c1);
  for (const [targetKind, targetRef] of [
    ["feature", "F-001"],
    ["feature", "F-002"],
    ["flow", "P-001"],
    ["rules", "rules"],
    ["roles", "roles"],
    ["deliverable", "functional"],
  ] as const) {
    const res = await client.submit(p1(), version, { targetKind, targetRef });
    expect(res.status, `${targetKind} ${targetRef} : ${JSON.stringify(res.body)}`).toBe(200);
  }
  for (const key of ["data", "architecture"]) {
    expect((await submit("owner", version, key)).status, key).toBe(200);
  }
};
const deliverables = async () => {
  const res = await deliverablesApi(bench().app, scene.p1.world.actors.owner).list(p1());
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const list = res.body.deliverables as Entry[];
  return {
    of: (key: string) => list.find((entry) => entry.key === key),
    validatedCount: res.body.validatedCount as number,
  };
};
const technicalRows = async () =>
  (await reviewRows(bench().database, p1())).filter((row) => row.target_ref === "technical");
const reviewAudits = async () =>
  (
    await bench().database.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_log WHERE action LIKE 'review.%'",
    )
  )[0]?.n;

beforeEach(async () => {
  scene = await createReviewScene(bench());
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("cas 6 : valider le cahier technique", () => {
  it.each(["owner", "admin", "dev"] as const)(
    "%s : un choix à trancher refuse l'approbation (409 choices_open), rien d'écrit",
    async (role) => {
      const version = await head(seeds(open()));
      await validateUpstream(version);
      const before = await reviewAudits();
      const res = await submit(role, version, "technical");
      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body).toMatchObject({ code: "CONFLICT", data: { reason: "choices_open" } });
      expect(await technicalRows()).toHaveLength(0);
      expect(await reviewAudits()).toBe(before);
    },
  );

  it("une version périmée reste STALE_VERSION avant le refus des choix ouverts", async () => {
    const version = await head(seeds(open()));
    await head(seeds(open(), "b"));
    const res = await submit("owner", version, "technical");
    expect(res.body.code).toBe("STALE_VERSION");
  });

  it("demande de modifications et retrait passent malgré un choix ouvert", async () => {
    const version = await head(seeds(open()));
    await validateUpstream(version);
    const asked = await submit("dev", version, "technical", {
      status: "changes_requested",
      comment: "Trancher le fournisseur.",
    });
    expect(asked.status, JSON.stringify(asked.body)).toBe(200);
    const withdrawn = await submit("dev", version, "technical", { status: "withdrawn" });
    expect(withdrawn.status, JSON.stringify(withdrawn.body)).toBe(200);
  });

  it("après « Choisir » : validé, Sécurité ouverte et à faire, un livrable validé de plus", async () => {
    const first = await head(seeds(open()));
    await validateUpstream(first);
    expect((await deliverables()).of("security")?.available).toBe(false);
    const version = await head(seeds(chosen()));
    await validateUpstream(version);
    const before = (await deliverables()).validatedCount;
    expect(before).toBe(3);
    const res = await submit("owner", version, "technical");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const after = await deliverables();
    expect(after.of("technical")?.status).toBe("validated");
    expect(after.validatedCount).toBe(4);
    expect(after.of("security")).toMatchObject({ available: true, status: "todo" });
    expect(after.of("quality")?.available).toBe(false);
    const items = itemApi(bench().app, scene.p1.world.actors.dev);
    for (const [type, id] of [
      ["operation", "reservation.create"],
      ["nfr", "NFR-001"],
    ] as const) {
      expect((await items.get(p1(), id, type)).body.validated, type).toBe(true);
    }
  });

  it.each(["designer", "client"] as const)("%s : 403, rien d'écrit", async (role) => {
    const version = await head(seeds(chosen()));
    await validateUpstream(version);
    expect((await submit(role, version, "technical")).status).toBe(403);
    expect(await technicalRows()).toHaveLength(0);
  });

  it("architecture modifiée : à revoir ; la même décision sur la nouvelle tête revalide", async () => {
    const version = await head(seeds(chosen()));
    await validateUpstream(version);
    expect((await submit("owner", version, "technical")).status).toBe(200);
    const next = await head(seeds(chosen(), "b"));
    expect((await deliverables()).of("technical")?.status).toBe("revise");
    const again = await submit("owner", next, "technical");
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect((await deliverables()).of("technical")?.status).toBe("validated");
    expect(await technicalRows()).toHaveLength(2);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("TK-115b : pas de validation sans choix de stack (B851)", () => {
  const bare = () => seeds(chosen()).filter((seed) => seed.kind !== chosen().kind);

  it.each(["owner", "admin", "dev"] as const)(
    "%s : aucun choix, 409 stack_missing, ni review ni audit",
    async (role) => {
      const version = await head(bare());
      await validateUpstream(version);
      const before = await reviewAudits();
      const res = await submit(role, version, "technical");
      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body).toMatchObject({ code: "CONFLICT", data: { reason: "stack_missing" } });
      expect(await technicalRows()).toHaveLength(0);
      expect(await reviewAudits()).toBe(before);
    },
  );

  it("une version périmée reste STALE_VERSION ; un rôle refusé reste 403", async () => {
    const version = await head(bare());
    await validateUpstream(version);
    expect((await submit("designer", version, "technical")).status).toBe(403);
    await head(seeds(open(), "b"));
    expect((await submit("owner", version, "technical")).body.code).toBe("STALE_VERSION");
  });

  it("demande de modifications et retrait passent sans choix", async () => {
    const version = await head(bare());
    await validateUpstream(version);
    const asked = await submit("dev", version, "technical", {
      status: "changes_requested",
      comment: "Ajouter la stack.",
    });
    expect(asked.status, JSON.stringify(asked.body)).toBe(200);
    const withdrawn = await submit("dev", version, "technical", { status: "withdrawn" });
    expect(withdrawn.status, JSON.stringify(withdrawn.body)).toBe(200);
  });

  it("une validation antérieure sans choix reste validée", async () => {
    const version = await head(bare());
    await validateUpstream(version);
    await bench().database.query(
      `INSERT INTO reviews (id, organization_id, project_id, repo_id, target_kind, target_ref, sha, status,
                            author_user_id, author_role, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'deliverable', 'technical', $4, 'approved', $5, 'owner', now(), now())`,
      [scene.p1.organizationId, p1(), scene.p1.repoId, version, scene.p1.world.actors.owner.userId],
    );
    expect((await deliverables()).of("technical")?.status).toBe("validated");
  });
});
