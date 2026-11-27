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
import {
  clearedSeeds,
  entryEntity,
  securityApi,
  tableEntity,
  threatEntity,
} from "./helpers/spec-security.ts";
import { stackEntity } from "./helpers/spec-technical.ts";

/**
 * TK-117 lot B (cas 3 et 6, B804, B805) : « Valider » la Sécurité. Menace élevée sans parade puis donnée à classer
 * refusent dans la transaction de `review.submit` (rien d'écrit), `security.validate` passe par elle ; amont modifié :
 * « À revoir » avec ce qui est concerné, puis validé de nouveau à contenu égal.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
type Role = "owner" | "admin" | "dev" | "designer" | "client" | "business";

beforeEach(async () => {
  scene = await createReviewScene(bench());
});

const p1 = () => scene.p1.projectId;
const actor = (role: Role) => scene.p1.world.actors[role];
const head = async (entities: EntitySeed[]) =>
  (
    await seedIndex(bench(), scene.p1, P1_FEATURES, {
      commit: true,
      entities: [...featureEntities(P1_FEATURES), ...entities],
    })
  ).sha;
const validate = (role: Role, version: string) =>
  securityApi(bench().app, actor(role)).validate(p1(), version);
const submit = (role: Role, version: string, over: Record<string, unknown> = {}) =>
  reviewApi(bench().app, actor(role)).submit(p1(), version, {
    targetKind: "deliverable",
    targetRef: "security",
    ...over,
  });
const written = async () => ({
  reviews: (await reviewRows(bench().database, p1())).filter((r) => r.target_ref === "security")
    .length,
  audits: (
    await bench().database.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_log WHERE action LIKE 'review.%' AND project_id = $1",
      [p1()],
    )
  )[0]?.n,
});
const entryOf = async (role: Role = "owner") => {
  const res = await deliverablesApi(bench().app, actor(role)).list(p1());
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.deliverables.find((d: { key: string }) => d.key === "security");
};

const openThreat = () => threatEntity("SEC-T08", { gravite: "elevee", parades: [] });
const undecided = () => [
  entryEntity("clientes.telephone", { categorie: "sensible", conservation_proposee: "1 an" }),
  entryEntity("clientes.identifiant"),
];

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même garde, un test par comportement
describe("valider la Sécurité", () => {
  it.each(["owner", "admin", "dev"] as const)(
    "%s : menace élevée sans parade, 409 threats_open par les deux voies, rien d'écrit",
    async (role) => {
      const version = await head(clearedSeeds({ threats: [openThreat()], entries: undecided() }));
      for (const call of [() => validate(role, version), () => submit(role, version)]) {
        const res = await call();
        expect(res.status, JSON.stringify(res.body)).toBe(409);
        expect(res.body).toMatchObject({ code: "CONFLICT", data: { reason: "threats_open" } });
      }
      expect(await written()).toEqual({ reviews: 0, audits: 0 });
    },
  );

  it.each([
    ["conservation absente (suggestion non comptée)", { entries: undecided() }],
    ["champ non classé", { entries: [entryEntity("clientes.identifiant")] }],
  ])("%s : 409 data_unclassified, rien d'écrit", async (_, over) => {
    const version = await head(clearedSeeds(over));
    for (const call of [() => validate("dev", version), () => submit("owner", version)]) {
      const res = await call();
      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body.data.reason).toBe("data_unclassified");
    }
    expect(await written()).toEqual({ reviews: 0, audits: 0 });
  });

  it("menace moyenne sans parade : ne bloque pas ; un champ ajouté à une table bloque", async () => {
    const medium = threatEntity("SEC-T02", { parades: [] });
    const version = await head(clearedSeeds({ threats: [medium] }));
    const res = await validate("dev", version);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ status: "approved", validation: "validated" });
    const next = await head([
      ...clearedSeeds().filter((e) => e.specId !== "T-clientes"),
      tableEntity("clientes", ["telephone", "identifiant", "photo"]),
    ]);
    expect((await validate("dev", next)).body.data.reason).toBe("data_unclassified");
  });

  it("corrigé : accepté ; le statut passe à « validé »", async () => {
    const blocked = await head(clearedSeeds({ threats: [openThreat()] }));
    expect((await validate("owner", blocked)).status).toBe(409);
    const fixed = await head(clearedSeeds());
    expect((await validate("owner", fixed)).status).toBe(200);
    expect((await entryOf()).status).toBe("validated");
    expect(await written()).toMatchObject({ reviews: 1 });
  });

  it("Fonctionnel à Sécurité validés : compteur « 5/7 »", async () => {
    const version = await head([
      entity("rule", "R-004", "a"),
      entity("flow", "P-001", "a"),
      entity("component", "C-api", "a", { id: "C-api", nom: "API", titre: "API" }),
      stackEntity("ST-sms", { statut: "choisi", choix: "Brevo" }),
      ...clearedSeeds(),
    ]);
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
    for (const key of ["data", "architecture", "technical", "security"]) {
      const res = await submit("owner", version, { targetRef: key });
      expect(res.status, `${key} : ${JSON.stringify(res.body)}`).toBe(200);
    }
    const list = await deliverablesApi(bench().app, actor("owner")).list(p1());
    expect(list.body.validatedCount).toBe(5);
    expect(list.body.deliverables).toHaveLength(7);
  });

  it("designer, client et business : 403, rien d'écrit ; version périmée : STALE_VERSION d'abord", async () => {
    const version = await head(clearedSeeds({ threats: [openThreat()] }));
    for (const role of ["designer", "client", "business"] as const) {
      expect((await validate(role, version)).status, role).toBe(403);
      expect((await submit(role, version)).status, role).toBe(403);
    }
    await head(clearedSeeds());
    expect((await validate("owner", version)).body.code).toBe("STALE_VERSION");
    expect(await written()).toEqual({ reviews: 0, audits: 0 });
  });

  it("demande de modifications et retrait passent malgré les blocages", async () => {
    const version = await head(clearedSeeds({ threats: [openThreat()] }));
    const asked = await submit("dev", version, {
      status: "changes_requested",
      comment: "Décider la parade.",
    });
    expect(asked.status, JSON.stringify(asked.body)).toBe(200);
    expect((await submit("dev", version, { status: "withdrawn" })).status).toBe(200);
  });

  it("amont modifié : « À revoir » et ce qui est concerné ; revalidé à contenu égal", async () => {
    const linked = threatEntity("SEC-T02", { liens: ["ST-sms"] });
    const upstream = (choice: string) => [
      ...clearedSeeds({ threats: [linked, threatEntity("SEC-T03")] }),
      stackEntity("ST-sms", { statut: "choisi", choix: choice }),
    ];
    const first = await head(upstream("Brevo"));
    expect((await validate("owner", first)).status).toBe(200);
    expect((await entryOf()).staleSecurity).toBeUndefined();
    const second = await head(upstream("Autre"));
    const stale = await entryOf("designer");
    expect(stale.status).toBe("revise");
    expect(stale.staleSecurity).toEqual({
      changes: [{ id: "ST-sms", change: "changed" }],
      items: ["SEC-T02"],
    });
    for (const role of ["client", "business"] as const) {
      expect((await entryOf(role)).staleSecurity, role).toBeUndefined();
    }
    expect((await validate("owner", second)).status).toBe(200);
    expect((await entryOf()).status).toBe("validated");
  });

  it("champ nouveau et rôle modifié depuis la décision : concernés", async () => {
    const first = await head(clearedSeeds());
    expect((await validate("owner", first)).status).toBe(200);
    await head([
      ...clearedSeeds().filter((e) => e.specId !== "T-clientes" && e.specId !== "roles"),
      tableEntity("clientes", ["telephone", "identifiant", "photo"]),
    ]);
    const stale = await entryOf();
    expect(stale.staleSecurity.items).toContain("clientes.photo");
    expect(stale.staleSecurity.changes).toEqual(
      expect.arrayContaining([
        { id: "T-clientes", change: "changed" },
        { id: "RL-accueil", change: "removed" },
      ]),
    );
  });
});
