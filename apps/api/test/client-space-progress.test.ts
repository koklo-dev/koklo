import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clientSpaceApi } from "./helpers/client-space.ts";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createNoClientScene,
  createReviewScene,
  FLOW_DATA,
  P1_FEATURES,
  type ReviewScene,
  ROLES_DATA,
  RULE_DATA,
  reviewApi,
} from "./helpers/reviews.ts";
import { type EntitySeed, entity, featureEntities, seedIndex } from "./helpers/spec-read.ts";

/**
 * TK-104 lot A (B347, critère 1) : `clientSpace.progress`. Compteurs par onglet (un bloc de règles ou de rôles = une unité),
 * première unité non traitée, éléments modifiés depuis la validation, droits de validation décidés par le serveur.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;

const BASE: EntitySeed[] = [
  ...featureEntities(P1_FEATURES),
  entity("rule", "R-001", "a", RULE_DATA),
  entity("rule", "R-002", "a", RULE_DATA),
  entity("roles", "roles", "a", ROLES_DATA),
  entity("flow", "P-001", "a", FLOW_DATA),
];
const p1 = () => scene.p1.projectId;
const head = async (entities: EntitySeed[] = BASE) =>
  (await seedIndex(bench(), scene.p1, P1_FEATURES, { commit: true, entities })).sha;
const progress = async (actor: { cookie: string } = scene.c1, projectId = p1()) =>
  clientSpaceApi(bench().app, actor).progress(projectId);
const approve = (version: string, targetKind: string, targetRef: string, status = "approved") =>
  reviewApi(bench().app, scene.c1).submit(p1(), version, { targetKind, targetRef, status });

beforeEach(async () => {
  scene = await createReviewScene(bench());
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("compteurs, suivante non traitée et éléments modifiés", () => {
  it("rien de traité : tous les onglets à traiter, la suivante est la première fonctionnalité", async () => {
    const version = await head();

    const res = await progress();

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      hasClient: true,
      canValidate: true,
      clientFirstName: "Nom",
      validation: "to_validate",
      tabs: {
        features: { count: 2, units: 2, treated: 0, toRevise: 0 },
        flows: { count: 1, units: 1, treated: 0, toRevise: 0 },
        rules: { count: 2, units: 1, treated: 0, toRevise: 0 },
        roles: { count: 1, units: 1, treated: 0, toRevise: 0 },
      },
      untreated: 5,
      toRevise: 0,
      changed: 0,
      next: { kind: "feature", ref: "F-001" },
      version,
    });
  });

  it("décisions : validé et demande comptent comme traités, la suivante avance", async () => {
    const version = await head();
    await approve(version, "feature", "F-001");
    await approve(version, "feature", "F-002", "changes_requested");

    const body = (await progress()).body;

    expect(body.tabs.features).toEqual({ count: 2, units: 2, treated: 2, toRevise: 1 });
    expect(body).toMatchObject({ untreated: 3, toRevise: 1, next: { kind: "flow", ref: "P-001" } });
  });

  it("tout traité : next null, le cahier est validé quand toutes ses unités le sont (sur le contenu courant)", async () => {
    const version = await head();
    const units = [
      ["feature", "F-001"],
      ["feature", "F-002"],
      ["flow", "P-001"],
      ["rules", "rules"],
      ["roles", "roles"],
    ] as const;
    for (const [kind, ref] of units) {
      await approve(version, kind, ref);
    }

    const body = (await progress()).body;
    expect(body).toMatchObject({ untreated: 0, next: null, validation: "validated" });
    expect(body.canValidate).toBe(true);
  });

  it("une modification de l'équipe invalide : l'élément redevient à traiter et compte dans « changed »", async () => {
    const version = await head();
    await approve(version, "flow", "P-001");
    await approve(version, "rules", "rules");
    const changed = BASE.map((e) =>
      e.specId === "P-001" ? entity("flow", "P-001", "b", FLOW_DATA) : e,
    );
    await head(changed);

    const body = (await progress()).body;

    expect(body.changed).toBe(1);
    expect(body.tabs.flows).toMatchObject({ treated: 0 });
    expect(body.tabs.rules).toMatchObject({ treated: 1 });
  });

  it("aucun SHA complet, chemin ni clé de proposition dans la sortie", async () => {
    const version = await head();
    const text = JSON.stringify((await progress()).body);
    expect(text).not.toMatch(/"(sha|path|filePath|proposal\w*)"/i);
    // Le jeton opaque `version` est la seule trace de la tête de spec.
    expect(text.replaceAll(version, "")).not.toMatch(/[0-9a-f]{40}/);
  });
});

describe("droits et cloisonnement", () => {
  it("canValidate : client oui ; business, dev, designer et owner avec client non", async () => {
    await head();
    const actors = scene.p1.world.actors;
    for (const [actor, expected] of [
      [scene.c1, true],
      [actors.business, false],
      [actors.dev, false],
      [actors.designer, false],
      [actors.owner, false],
    ] as const) {
      const res = await progress(actor);
      expect(res.status, actor.role).toBe(200);
      expect(res.body.canValidate, actor.role).toBe(expected);
      expect(res.body.hasClient).toBe(true);
    }
  });

  it("sans client invité : owner et admin peuvent valider, hasClient faux, pas de prénom", async () => {
    const bare = await createNoClientScene(bench(), scene);
    await seedIndex(bench(), bare, P1_FEATURES, { commit: true, entities: BASE });

    for (const role of ["owner", "admin"] as const) {
      const res = await progress(scene.p1.world.actors[role], bare.projectId);
      expect(res.body).toMatchObject({
        hasClient: false,
        canValidate: true,
        clientFirstName: null,
      });
    }
    const dev = await progress(scene.p1.world.actors.dev, bare.projectId);
    expect(dev.body.canValidate).toBe(false);
  });

  it("client d'un autre projet ou sans lien : 404 uniforme ; projet inconnu : 404 ; sans session : 401", async () => {
    await head();
    expect((await progress(scene.c2)).status).toBe(404);
    expect((await progress(scene.c3)).status).toBe(404);
    expect((await progress(scene.c1, scene.foreign.projectId)).status).toBe(404);
    expect((await clientSpaceApi(bench().app, undefined).progress(p1())).status).toBe(401);
  });

  it("espace non prêt (rien d'indexé) : 503 SPACE_NOT_READY", async () => {
    const bare = await createNoClientScene(bench(), scene);
    const res = await progress(scene.p1.world.actors.owner, bare.projectId);
    expect(res.status).toBe(503);
  });
});
