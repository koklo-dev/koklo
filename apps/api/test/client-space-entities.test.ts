import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clientSpaceApi, createSpaceScene, type SpaceScene } from "./helpers/client-space.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { FLOW_DATA, ROLES_DATA, RULE_DATA, reviewApi } from "./helpers/reviews.ts";
import {
  type EntitySeed,
  entity,
  type FeatureSeed,
  featureEntities,
  seedIndex,
  specReadApi,
} from "./helpers/spec-read.ts";

/**
 * TK-104 lot A (B347, critères 4, 5 et 9) : lectures client des parcours, règles et rôles, et `clientSpace.features`
 * étendu (`untreated`, `around`, fiche à liens libellés et note de version). Langage simple, aucun chemin ni SHA entier,
 * aucune proposition ; `spec.*` reste fermé au client.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: SpaceScene;
beforeEach(async () => {
  scene = await createSpaceScene(bench());
});

const api = () => clientSpaceApi(bench().app, scene.c1);
const p1 = () => scene.p1.projectId;
const features = (n: number): FeatureSeed[] =>
  Array.from({ length: n }, (_, i) => {
    const id = `F-${String(i + 1).padStart(3, "0")}`;
    return {
      id,
      titre: `Feature ${i + 1}`,
      priorite: "must",
      criteres: [{ titre: "Un critère" }],
      ...(i === 0 ? { regles: ["R-001"], roles: ["RL-accueil"], ecrans: ["S-reservation"] } : {}),
    };
  });
const entities = (seeds: FeatureSeed[]): EntitySeed[] => [
  ...featureEntities(seeds),
  entity("rule", "R-001", "a", RULE_DATA),
  entity("rule", "R-002", "a", { ...RULE_DATA, titre: "Délai d'annulation" }),
  entity("roles", "roles", "a", ROLES_DATA),
  entity("flow", "P-reserver", "a", FLOW_DATA),
  entity("flow", "P-annuler", "a", { ...FLOW_DATA, titre: "Annuler" }),
  entity("screen", "S-reservation", "a", { titre: "Écran coordonnées" }),
];
const index = async (n = 3) => {
  const seeds = features(n);
  return seedIndex(bench(), scene.p1, seeds, { commit: true, entities: entities(seeds) });
};
const clientReview = (
  version: string,
  targetKind: string,
  targetRef: string,
  status = "approved",
) => reviewApi(bench().app, scene.c1).submit(p1(), version, { targetKind, targetRef, status });

describe("clientSpace.flows : parcours en langage simple, avec leur statut", () => {
  it("liste les parcours sans chemin de fichier, à valider par défaut, jeton de version", async () => {
    const { sha } = await index();

    const res = await api().flows(p1());

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.version).toBe(sha);
    expect(res.body.total).toBe(2);
    const first = res.body.items[0];
    expect(first).toMatchObject({
      id: "P-reserver",
      title: "Réserver",
      actor: "Cliente",
      start: { label: "Ouvrir l'agenda" },
      steps: [{ label: "Choisir un créneau" }],
      features: ["F-001"],
      validation: "to_validate",
      previouslyValidated: false,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/filePath|flows\/|"path"/);
  });

  it("une validation du parcours se reflète ; une modification le remet à valider (précédemment validé)", async () => {
    const { sha } = await index();
    await clientReview(sha, "flow", "P-reserver");
    expect((await api().flows(p1())).body.items[0].validation).toBe("validated");

    const seeds = features(3);
    const changed = entities(seeds).map((e) =>
      e.specId === "P-reserver" ? entity("flow", "P-reserver", "b", FLOW_DATA) : e,
    );
    await seedIndex(bench(), scene.p1, seeds, { commit: true, entities: changed });

    expect((await api().flows(p1())).body.items[0]).toMatchObject({
      validation: "to_validate",
      previouslyValidated: true,
    });
  });

  it("pagination par curseur : limit 1, page suivante, curseur étranger refusé (422)", async () => {
    await index();
    const first = await api().flows(p1(), "?limit=1");
    expect(first.body.items).toHaveLength(1);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await api().flows(p1(), `?limit=1&cursor=${first.body.nextCursor}`);
    expect(second.body.items.map((i: { id: string }) => i.id)).toEqual(["P-annuler"]);
    expect((await api().flows(p1(), "?cursor=nimportequoi")).status).toBe(422);
  });
});

describe("clientSpace.rules et clientSpace.roles : lecture par bloc", () => {
  it("règles : énoncés en clair, validation du bloc entier", async () => {
    const { sha } = await index();
    await clientReview(sha, "rules", "rules");

    const res = await api().rules(p1());

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      validation: "validated",
      previouslyValidated: false,
      version: sha,
      total: 2,
    });
    expect(res.body.items[0]).toMatchObject({
      id: "R-001",
      title: "Pas de double réservation",
      type: "contrainte",
      statement: "Un créneau n'a qu'une réservation.",
      features: ["F-001"],
    });
    expect(JSON.stringify(res.body)).not.toMatch(/filePath|"path"|rules\//);
  });

  it("rôles : la matrice lisible et la validation du bloc", async () => {
    const { sha } = await index();

    const res = await api().roles(p1());

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.validation).toBe("to_validate");
    expect(res.body.roles).toEqual([
      { id: "RL-accueil", name: "Accueil", description: "Reçoit les clients" },
    ]);
    expect(res.body.actions[0]).toMatchObject({
      specId: "PM-booking.read",
      resource: "booking",
      access: [{ roleId: "RL-accueil", level: "allowed" }],
    });
    expect(res.body.version).toBe(sha);
  });

  it("sans règle ni rôle indexé : listes vides, jamais d'erreur", async () => {
    const seeds = features(1);
    await seedIndex(bench(), scene.p1, seeds, { commit: true, entities: featureEntities(seeds) });
    expect((await api().rules(p1())).body).toMatchObject({ items: [], total: 0 });
    expect((await api().roles(p1())).body).toMatchObject({ roles: [], actions: [] });
  });
});

describe("droits, cloisonnement et fuites", () => {
  it.each(["flows", "rules", "roles"] as const)(
    "%s : client d'un autre projet, sans lien ou autre organisation : 404 ; business : lecture permise",
    async (route) => {
      await index();
      const read = (actor: { cookie: string }, projectId = p1()) =>
        clientSpaceApi(bench().app, actor)[route](projectId);
      expect((await read(scene.c2)).status).toBe(404);
      expect((await read(scene.c3)).status).toBe(404);
      expect((await read(scene.foreign.world.actors.owner)).status).toBe(404);
      expect((await read(scene.p1.world.actors.business)).status).toBe(200);
      expect((await read(scene.p1.world.actors.dev)).status).toBe(200);
    },
  );

  it("le client est fermé à spec.* et proposal.*, et n'en voit aucune clé dans clientSpace.*", async () => {
    await index();
    const spec = specReadApi(bench().app, scene.c1);
    expect((await spec.list(p1())).status).toBe(403);
    const text = JSON.stringify([
      (await api().progress(p1())).body,
      (await api().flows(p1())).body,
      (await api().rules(p1())).body,
      (await api().roles(p1())).body,
      (await api().feature(p1(), "F-001")).body,
    ]);
    expect(text).not.toMatch(/proposal|agent_|"launch/i);
  });

  it("espace non prêt : 503 sur les trois lectures", async () => {
    for (const read of [api().flows, api().rules, api().roles]) {
      expect((await read(p1())).status).toBe(503);
    }
  });
});

describe("clientSpace.feature : liens libellés et note de version", () => {
  it("liens dans l'ordre règles, parcours, rôles, écrans, par libellé", async () => {
    await index();

    const res = await api().feature(p1(), "F-001");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.links).toEqual([
      { id: "R-001", label: "Pas de double réservation" },
      { id: "P-reserver", label: "Réserver" },
      { id: "P-annuler", label: "Annuler" },
      { id: "RL-accueil", label: "Accueil" },
      { id: "S-reservation", label: "Écran coordonnées" },
    ]);
  });

  it("note de version : date et sept caractères du commit, jamais le SHA entier ni un chemin", async () => {
    const { sha } = await index();

    const res = await api().feature(p1(), "F-001");

    expect(res.body.versionNote).toEqual({ date: "2026-10-31", label: sha.slice(0, 7) });
    expect(JSON.stringify(res.body.versionNote)).not.toContain(sha);
    expect(JSON.stringify(res.body.versionNote)).not.toMatch(/\.md|features\//);
  });
});

describe("clientSpace.features : non traitées, amener la page d'une fonctionnalité", () => {
  it("untreated ne garde que les fonctionnalités à valider, total et offset sur la liste filtrée", async () => {
    const { sha } = await index(5);
    await clientReview(sha, "feature", "F-001");
    await clientReview(sha, "feature", "F-003", "changes_requested");

    const res = await api().features(p1(), "?untreated=true");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual(["F-002", "F-004", "F-005"]);
    expect(res.body).toMatchObject({ total: 3, offset: 0, nextCursor: null });
  });

  it("around amène la page de la fonctionnalité, alignée sur limit, avec son rang", async () => {
    await index(30);

    const res = await api().features(p1(), "?limit=10&around=F-025");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items.map((i: { id: string }) => i.id)[0]).toBe("F-021");
    expect(res.body.items).toHaveLength(10);
    expect(res.body).toMatchObject({ offset: 20, total: 30 });
    expect(res.body.nextCursor).toBeNull();
    const middle = await api().features(p1(), "?limit=10&around=F-015");
    expect(middle.body).toMatchObject({ offset: 10, nextCursor: expect.any(String) });
  });

  it("around hors des filtres actifs : première page ; around avec curseur : 422 ; inconnue : 404", async () => {
    const { sha } = await index(30);
    await clientReview(sha, "feature", "F-025");
    const hidden = await api().features(p1(), "?limit=10&untreated=true&around=F-025");
    expect(hidden.body.items[0].id).toBe("F-001");
    expect(hidden.body.offset).toBe(0);
    expect((await api().features(p1(), "?around=F-001&cursor=abc")).status).toBe(422);
    expect((await api().features(p1(), "?around=F-999")).status).toBe(404);
  });
});
