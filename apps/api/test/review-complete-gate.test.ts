import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createNoClientScene,
  createReviewScene,
  notificationTotal,
  P1_FEATURES,
  type ReviewScene,
  reviewApi,
  reviewRows,
  reviewTotal,
} from "./helpers/reviews.ts";
import { deliverablesApi } from "./helpers/spec-deliverables.ts";
import { type EntitySeed, entity, featureEntities, seedIndex } from "./helpers/spec-read.ts";

/**
 * TK-104 lot A (B351, critères 2, 3 et 6) : garde serveur de « Valider le cahier » (`deliverable:functional` approuvé) et de
 * « Envoyer mes demandes » (`changes_requested`). Le refus est un 409 `review_incomplete`, placé après la politique par cible
 * (un rôle sans droit reçoit 403, jamais 409) et avant toute écriture.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;

const BASE: EntitySeed[] = [
  ...featureEntities(P1_FEATURES),
  entity("rule", "R-001", "a"),
  entity("roles", "roles", "a"),
  entity("flow", "P-001", "a"),
];
const UNITS = [
  ["feature", "F-001"],
  ["feature", "F-002"],
  ["flow", "P-001"],
  ["rules", "rules"],
  ["roles", "roles"],
] as const;

const p1 = () => scene.p1.projectId;
const as = (role: "owner" | "admin" | "dev" | "designer" | "business") =>
  reviewApi(bench().app, scene.p1.world.actors[role]);
const client = () => reviewApi(bench().app, scene.c1);
const head = async (entities: EntitySeed[] = BASE) =>
  (await seedIndex(bench(), scene.p1, P1_FEATURES, { commit: true, entities })).sha;
const whole = (status: "approved" | "changes_requested") => ({
  targetKind: "deliverable",
  targetRef: "functional",
  status,
});
const decide = async (
  version: string,
  units: readonly (readonly [string, string])[],
  status = "approved",
) => {
  for (const [targetKind, targetRef] of units) {
    const res = await client().submit(p1(), version, { targetKind, targetRef, status });
    expect(res.status, `${targetKind} ${targetRef} : ${JSON.stringify(res.body)}`).toBe(200);
  }
};
const status = async () =>
  (
    (await deliverablesApi(bench().app, scene.p1.world.actors.owner).list(p1())).body
      .deliverables as { key: string; status: string }[]
  ).find((d) => d.key === "functional")?.status;

beforeEach(async () => {
  scene = await createReviewScene(bench());
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("Valider le cahier : tout doit être validé sur le contenu courant", () => {
  it("rien de validé : 409 review_incomplete, aucune review ni notification écrite", async () => {
    const version = await head();
    const reviews = await reviewTotal(bench().database, scene.p1.organizationId);
    const notifications = await notificationTotal(bench().database, scene.p1.organizationId);

    const res = await client().submit(p1(), version, whole("approved"));

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "CONFLICT", data: { reason: "review_incomplete" } });
    expect(await reviewTotal(bench().database, scene.p1.organizationId)).toBe(reviews);
    expect(await notificationTotal(bench().database, scene.p1.organizationId)).toBe(notifications);
  });

  it("une unité manque : 409 ; toutes validées : 200 et le livrable est Validé", async () => {
    const version = await head();
    await decide(version, UNITS.slice(0, 4));
    expect((await client().submit(p1(), version, whole("approved"))).status).toBe(409);

    await decide(version, UNITS.slice(4));
    const res = await client().submit(p1(), version, whole("approved"));

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.validation).toBe("validated");
    expect(await status()).toBe("validated");
  });

  it("une demande de changement d'actualité bloque la validation du cahier", async () => {
    const version = await head();
    await decide(version, UNITS.slice(1));
    await decide(version, UNITS.slice(0, 1), "changes_requested");

    const res = await client().submit(p1(), version, whole("approved"));

    expect(res.status).toBe(409);
    expect(res.body.data).toEqual({ reason: "review_incomplete" });
  });

  it("une modification invalide (hachage) : la validation du cahier est de nouveau refusée", async () => {
    const version = await head();
    await decide(version, UNITS);
    expect((await client().submit(p1(), version, whole("approved"))).status).toBe(200);
    const changed = BASE.map((e) => (e.specId === "P-001" ? entity("flow", "P-001", "b") : e));
    const next = await head(changed);

    const res = await client().submit(p1(), next, whole("approved"));

    expect(res.status).toBe(409);
    expect(res.body.data).toEqual({ reason: "review_incomplete" });
  });

  it("la politique passe d'abord : un développeur reçoit 403, pas 409 ; l'owner avec client aussi", async () => {
    const version = await head();
    expect((await as("dev").submit(p1(), version, whole("approved"))).status).toBe(403);
    expect((await as("owner").submit(p1(), version, whole("approved"))).status).toBe(403);
    expect((await as("business").submit(p1(), version, whole("approved"))).status).toBe(403);
    expect(await reviewRows(bench().database, p1())).toHaveLength(0);
  });
});

describe("Envoyer mes demandes : tout traité et au moins une demande d'actualité", () => {
  it("sans demande d'actualité : 409 review_incomplete", async () => {
    const version = await head();
    await decide(version, UNITS);

    const res = await client().submit(p1(), version, whole("changes_requested"));

    expect(res.status).toBe(409);
    expect(res.body.data).toEqual({ reason: "review_incomplete" });
  });

  it("une unité reste à valider : 409 même avec une demande", async () => {
    const version = await head();
    await decide(version, UNITS.slice(1, 4));
    await decide(version, UNITS.slice(0, 1), "changes_requested");

    expect((await client().submit(p1(), version, whole("changes_requested"))).status).toBe(409);
  });

  it("tout traité avec une demande : 200, livrable À revoir, une notification d'équipe", async () => {
    const version = await head();
    await decide(version, UNITS.slice(1));
    await decide(version, UNITS.slice(0, 1), "changes_requested");
    const before = await notificationTotal(bench().database, scene.p1.organizationId);

    const res = await client().submit(p1(), version, whole("changes_requested"));

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.validation).toBe("to_revise");
    expect(await status()).toBe("revise");
    const after = await notificationTotal(bench().database, scene.p1.organizationId);
    expect(after - before).toBeGreaterThan(0);
  });
});

describe("sans client invité : owner et admin portent la même garde (D1)", () => {
  it("owner : 409 tant que tout n'est pas validé, 200 ensuite ; dev : 403", async () => {
    const bare = await createNoClientScene(bench(), scene);
    const version = (await seedIndex(bench(), bare, P1_FEATURES, { commit: true, entities: BASE }))
      .sha;
    const owner = reviewApi(bench().app, scene.p1.world.actors.owner);

    const refused = await owner.submit(bare.projectId, version, whole("approved"));
    expect(refused.status).toBe(409);
    for (const [targetKind, targetRef] of UNITS) {
      const res = await owner.submit(bare.projectId, version, { targetKind, targetRef });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    }
    expect((await owner.submit(bare.projectId, version, whole("approved"))).status).toBe(200);
    const dev = reviewApi(bench().app, scene.p1.world.actors.dev);
    expect((await dev.submit(bare.projectId, version, whole("approved"))).status).toBe(403);
  });
});

describe("hors du Fonctionnel : aucune garde de complétude", () => {
  it("le livrable Données se valide par l'équipe technique sans que le cahier soit traité", async () => {
    const version = await head([...BASE, entity("table", "T-user", "a")]);
    const res = await as("dev").submit(p1(), version, {
      targetKind: "deliverable",
      targetRef: "data",
      status: "approved",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});
