import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createReviewScene,
  P1_FEATURES,
  type ReviewScene,
  reviewApi,
  reviewRows,
} from "./helpers/reviews.ts";
import { type EntitySeed, entity, featureEntities, seedIndex } from "./helpers/spec-read.ts";

/**
 * TK-100 lot B (B325 d, e, D1) : rôles par cible. Fonctionnel et Design : le client s'il y en a un d'invité, sinon owner
 * ou admin (la décision vient de `project_client_access`, jamais de l'entrée). Données, Architecture, Technique, Sécurité,
 * Qualité : owner, admin, développeur. Designer, business et jeton d'agent : jamais. `review.list` : le client ne lit que
 * ses cibles ; « validé par l'équipe · sans client » = `onBehalf`.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
let version: string;
type Role = "owner" | "admin" | "dev" | "designer" | "business" | "client";

const ENTITIES: EntitySeed[] = [
  ...featureEntities(P1_FEATURES),
  entity("rule", "R-001"),
  entity("roles", "roles"),
  entity("flow", "P-001"),
  entity("table", "T-user"),
];
beforeEach(async () => {
  scene = await createReviewScene(bench());
  version = (await seedIndex(bench(), scene.p1, P1_FEATURES, { commit: true, entities: ENTITIES }))
    .sha;
});
const p1 = () => scene.p1.projectId;
const as = (role: Role) => reviewApi(bench().app, scene.p1.world.actors[role]);
const withoutClient = () =>
  bench().database.query("DELETE FROM project_client_access WHERE project_id = $1", [p1()]);

type Target = readonly [string, string];
const FUNCTIONAL: Target[] = [
  ["feature", "F-001"],
  ["flow", "P-001"],
  ["rules", "rules"],
  ["roles", "roles"],
  ["deliverable", "functional"],
];
/** TK-104 (B351) : « Valider le cahier » exige que toutes les unités du Fonctionnel soient traitées. */
const UNITS: Target[] = [
  ["feature", "F-001"],
  ["feature", "F-002"],
  ["flow", "P-001"],
  ["rules", "rules"],
  ["roles", "roles"],
];
const isWhole = ([kind]: Target) => kind === "deliverable";
const validateUnits = async (role: Role) => {
  for (const unit of UNITS) expect(await statusOf(role, unit), `${role} ${unit[1]}`).toBe(200);
};
const submitAs = (role: Role, [targetKind, targetRef]: Target) =>
  as(role).submit(p1(), version, { targetKind, targetRef });
const statusOf = async (role: Role, target: Target) => (await submitAs(role, target)).status;

describe("D1 : un client est invité", () => {
  it.each(FUNCTIONAL)(
    "%s %s : le client valide, owner, admin, dev, designer, business : 403",
    async (...target) => {
      for (const role of ["owner", "admin", "dev", "designer", "business"] as const) {
        expect(await statusOf(role, target), role).toBe(403);
      }
      expect(await reviewRows(bench().database, p1())).toHaveLength(0);
      if (isWhole(target)) await validateUnits("client");
      expect(await statusOf("client", target)).toBe(200);
    },
  );
});

describe("D1 : aucun client invité", () => {
  it.each(FUNCTIONAL)(
    "%s %s : owner et admin valident ; dev, designer, business : 403",
    async (...target) => {
      await withoutClient();
      for (const role of ["dev", "designer", "business"] as const) {
        expect(await statusOf(role, target), role).toBe(403);
      }
      if (isWhole(target)) await validateUnits("owner");
      expect(await statusOf("owner", target)).toBe(200);
      expect(await statusOf("admin", target)).toBe(200);
    },
  );

  it("la validation de l'équipe est signalée « sans client » (onBehalf) dans le journal", async () => {
    await withoutClient();
    await submitAs("owner", ["feature", "F-001"]);
    const res = await as("admin").list(p1());
    expect(res.body.items).toMatchObject([
      { targetRef: "F-001", authorRole: "owner", onBehalf: true },
    ]);
  });

  it("l'entrée ne décide pas : un faux hasClient ou un rôle forgé est ignoré", async () => {
    const res = await as("owner").submit(p1(), version, {
      hasClient: false,
      role: "client",
      authorRole: "client",
    });
    expect(res.status).toBe(403);
  });
});

describe("cibles techniques : owner, admin, dev", () => {
  it.each(["data"])(
    "livrable %s : owner, admin et dev valident, avec ou sans client",
    async (key) => {
      for (const role of ["owner", "admin", "dev"] as const)
        expect(await statusOf(role, ["deliverable", key]), role).toBe(200);
      await withoutClient();
      expect(await statusOf("dev", ["deliverable", key])).toBe(200);
    },
  );

  it("le client, le designer et le business ne valident pas le livrable Données (403)", async () => {
    for (const role of ["client", "designer", "business"] as const) {
      expect(await statusOf(role, ["deliverable", "data"]), role).toBe(403);
    }
    expect(await reviewRows(bench().database, p1())).toHaveLength(0);
  });

  it("une validation technique de l'équipe n'est pas « sans client » (onBehalf faux)", async () => {
    await submitAs("dev", ["deliverable", "data"]);
    const res = await as("owner").list(p1());
    expect(res.body.items).toMatchObject([
      { targetKind: "deliverable", authorRole: "dev", onBehalf: false },
    ]);
  });
});

describe("jeton d'agent et écrans", () => {
  it("jeton d'agent (Authorization: Bearer) sans session : refusé sur chaque cible, rien d'écrit", async () => {
    for (const [targetKind, targetRef] of [...FUNCTIONAL, ["deliverable", "data"]]) {
      const res = await request(bench().app.getHttpServer())
        .post(`/projects/${p1()}/reviews`)
        .set("Authorization", "Bearer koklo-agent-token")
        .send({ projectId: p1(), targetKind, targetRef, version, status: "approved" });
      expect([401, 403], `${targetKind} ${targetRef}`).toContain(res.status);
    }
    expect(await reviewRows(bench().database, p1())).toHaveLength(0);
  });

  it("une cible écran reste refusée (422), même pour l'owner sans client", async () => {
    await withoutClient();
    const res = await as("owner").submit(p1(), version, {
      targetKind: "screen",
      targetRef: "S-home",
    });
    expect(res.status).toBe(422);
  });
});

describe("review.list : le client ne lit que ses cibles", () => {
  it("le client voit fonctionnel et Design, jamais Données ; l'équipe voit tout", async () => {
    await submitAs("client", ["feature", "F-001"]);
    await submitAs("dev", ["deliverable", "data"]);
    await bench().database.query(
      `INSERT INTO reviews (id, organization_id, project_id, repo_id, target_kind, target_ref, sha, status, author_user_id, author_role, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'deliverable', 'design', $4, 'approved', $5, 'owner', now(), now())`,
      [scene.p1.organizationId, p1(), scene.p1.repoId, version, scene.p1.world.actors.owner.userId],
    );

    const client = await reviewApi(bench().app, scene.c1).list(p1());
    const staff = await as("designer").list(p1());

    const refs = (res: { body: { items: { targetRef: string }[] } }) =>
      res.body.items.map((i) => i.targetRef).sort();
    expect(refs(client)).toEqual(["F-001", "design"]);
    expect(refs(staff)).toEqual(["F-001", "data", "design"]);
    expect(JSON.stringify(client.body)).not.toContain("data");
    // Le SHA est du vocabulaire git, fermé au client (D7) ; l'équipe le garde.
    expect(client.body.items.map((i: { sha: string | null }) => i.sha)).toEqual([null, null]);
    expect(staff.body.items.every((i: { sha: string | null }) => i.sha === version)).toBe(true);
  });
});
