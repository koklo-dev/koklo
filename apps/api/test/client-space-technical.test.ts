import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import { createReviewScene, type ReviewScene, reviewApi } from "./helpers/reviews.ts";
import { commitAtHead } from "./helpers/spec-architecture.ts";
import { seedIndex } from "./helpers/spec-read.ts";
import {
  clientTechnicalApi,
  componentEntity,
  environmentsEntity,
  nfrEntity,
  operationEntity,
  restEntity,
  stackEntity,
} from "./helpers/spec-technical.ts";

/**
 * TK-115 lot B (cas 6, B725, B726) : cahier technique vu du client. Rien tant que le livrable n'est pas validé ; validé :
 * comptes, choix, environnements et document, sans YAML, chemin ni SHA ; projet non lié : 404.
 * TK-116 (cas 5) : opérations, fiche et exigences, sans YAML, chemin, SHA ni contrat ; « validé » suppose les choix tranchés.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
let sha: string;

beforeEach(async () => {
  scene = await createReviewScene(bench());
  const seeded = await seedIndex(bench(), scene.p1, [], {
    commit: true,
    entities: [
      stackEntity("ST-sms", { statut: "choisi", choix: "Brevo" }),
      componentEntity("C-sms"),
      nfrEntity("NFR-001"),
      operationEntity("reservation.create"),
      restEntity("E-ancien"),
      environmentsEntity(),
    ],
  });
  sha = await commitAtHead(bench(), scene.p1, seeded.snapshotId, [
    {
      path: "tech/cahier-technique/01-objet.md",
      content: "---\nstatut: validee\n---\n# Objet\n\nCe cahier fixe les choix.\n",
    },
  ]);
});

const client = () => clientTechnicalApi(bench().app, scene.c1);
const validate = async () => {
  const res = await reviewApi(bench().app, scene.p1.world.actors.owner).submit(
    scene.p1.projectId,
    sha,
    { targetKind: "deliverable", targetRef: "technical" },
  );
  expect(res.status, JSON.stringify(res.body)).toBe(200);
};
const all = async () => [
  await client().summary(scene.p1.projectId),
  await client().stack(scene.p1.projectId),
  await client().environments(scene.p1.projectId),
  await client().document(scene.p1.projectId),
];

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("clientSpace.technical*", () => {
  it("non validé : available faux et rien d'autre", async () => {
    const [summary, stack, environments, document] = await all();
    expect(summary?.body).toEqual({
      available: false,
      validation: "to_validate",
      counts: { choices: 0, operations: 0, requirements: 0, environments: 0 },
    });
    expect(stack?.body).toMatchObject({ available: false, items: [], total: 0 });
    expect(environments?.body).toEqual({
      available: false,
      validation: "to_validate",
      environments: [],
      variables: [],
      integrations: [],
    });
    expect(document?.body).toEqual({ available: false, validation: "to_validate", sections: [] });
    const text = JSON.stringify([summary?.body, stack?.body, environments?.body, document?.body]);
    expect(text).not.toMatch(/Brevo|recette|cahier fixe/);
  });

  it("validé : comptes, choix, environnements et document, sans YAML, chemin ni SHA", async () => {
    await validate();
    const [summary, stack, environments, document] = await all();
    expect(summary?.body, JSON.stringify(summary?.body)).toEqual({
      available: true,
      validation: "validated",
      counts: { choices: 1, operations: 1, requirements: 1, environments: 2 },
    });
    expect(stack?.body.items).toHaveLength(1);
    expect(stack?.body.items[0]).toMatchObject({
      id: "ST-sms",
      status: "chosen",
      plain: "Le prestataire des rappels reste à choisir.",
    });
    expect(environments?.body.environments).toHaveLength(2);
    expect(environments?.body.variables).toEqual([
      { name: "DATABASE_URL", usage: "Connexion à la base" },
    ]);
    expect(document?.body.sections).toEqual([
      {
        specId: "DOC-objet",
        num: 1,
        title: "Objet",
        status: "validee",
        markdown: "Ce cahier fixe les choix.",
      },
    ]);
    const text = JSON.stringify([summary?.body, stack?.body, environments?.body, document?.body]);
    expect(text).not.toMatch(/yaml|filePath|commitSha|tech\//i);
    expect(text).not.toContain(sha);
  });

  it("recherche et lien direct d'un choix", async () => {
    await validate();
    const found = await client().stack(scene.p1.projectId, "?q=SMS");
    expect(found.body.items.map((i: { id: string }) => i.id)).toEqual(["ST-sms"]);
    expect((await client().stack(scene.p1.projectId, "?around=ST-sms")).status).toBe(200);
  });

  it("client d'un autre projet : 404 sans rien divulguer", async () => {
    await validate();
    const other = clientTechnicalApi(bench().app, scene.c2);
    for (const res of [
      await other.summary(scene.p1.projectId),
      await other.stack(scene.p1.projectId),
      await other.environments(scene.p1.projectId),
      await other.document(scene.p1.projectId),
    ]) {
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toMatch(/Brevo|recette/);
    }
  });

  it("opérations et exigences : rien tant que ce n'est pas validé, même pour une opération inconnue", async () => {
    const p = scene.p1.projectId;
    const list = await client().ops(p);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body).toMatchObject({ available: false, items: [], total: 0 });
    for (const id of ["reservation.create", "agenda.absent"]) {
      const one = await client().op(p, id);
      expect(one.body, id).toEqual({
        available: false,
        validation: "to_validate",
        operation: null,
      });
    }
    expect((await client().nfr(p)).body).toMatchObject({ available: false, items: [], total: 0 });
  });

  it("validé : liste, fiche et exigences lisibles, `id` sans chemin, SHA, YAML ni contrat", async () => {
    await validate();
    const p = scene.p1.projectId;
    const [list, one, nfr] = [
      await client().ops(p),
      await client().op(p, "reservation.create"),
      await client().nfr(p),
    ];
    expect(list.body, JSON.stringify(list.body)).toMatchObject({ available: true, total: 1 });
    expect(list.body.items[0]).toMatchObject({ id: "reservation.create", zone: "Réservation" });
    expect(list.body.facets).toEqual({ zone: { Réservation: 1 } });
    expect(one.body.operation).toMatchObject({ id: "reservation.create", input: [], callers: [] });
    expect(nfr.body.items[0]).toMatchObject({ id: "NFR-001", category: "performance" });
    const bodies = [list.body, one.body, nfr.body];
    const keys = [...JSON.stringify(bodies).matchAll(/"([A-Za-z_]+)":/g)].map((m) => m[1]);
    for (const banned of ["specId", "filePath", "commitSha", "yaml", "code"]) {
      expect(keys, banned).not.toContain(banned);
    }
    expect(JSON.stringify(bodies)).not.toContain(sha);
    expect((await client().op(p, "agenda.absent")).status).toBe(404);
  });

  it("client d'un autre projet : 404 sur les opérations et les exigences", async () => {
    await validate();
    const other = clientTechnicalApi(bench().app, scene.c2);
    for (const res of [
      await other.ops(scene.p1.projectId),
      await other.op(scene.p1.projectId, "reservation.create"),
      await other.nfr(scene.p1.projectId),
    ]) {
      expect(res.status).toBe(404);
    }
  });
});
