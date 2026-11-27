import { emitStackYaml } from "@koklo/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench, type RepoBench } from "./helpers/repo-scene.ts";
import {
  BOT,
  BRANCH,
  batchRows,
  fileOf,
  installSpecBench,
  operationRows,
  type SpecBench,
  specScene,
} from "./helpers/spec-batch.ts";
import { itemApi } from "./helpers/spec-items.ts";
import { readScene, type SpecReadScene, seedIndex, specReadApi } from "./helpers/spec-read.ts";
import {
  componentEntity,
  environmentsEntity,
  nfrEntity,
  operationEntity,
  stackEntity,
  technicalApi,
} from "./helpers/spec-technical.ts";

/**
 * TK-115 lot B (cas 7, B719, B728) : onglet Stack. `spec.technical.stack.list` (pages de 24, tri couche puis identifiant,
 * facettes, `q`, `around`), YAML d'un choix, fiche (`spec.item.get`), compteurs de tête, autocomplétion, et « Choisir » :
 * un lot d'une seule `stack.update`, statut choisi ; option inconnue : 422.
 */
const read = installBench({ beforeAll, afterAll, beforeEach });
const write = installSpecBench({ beforeAll, afterAll, beforeEach });

const SEEDS = () => [
  stackEntity("ST-web", {
    couche: "applications",
    role: "Applications web",
    statut: "choisi",
    choix: "Next.js 15",
    recommande: undefined,
    options: ["Next.js", "Remix"],
    criteres: [{ nom: "Rapidité", valeurs: ["Bonne", "Bonne"] }],
    composants: ["C-portail"],
  }),
  stackEntity("ST-sms"),
  componentEntity("C-sms"),
  nfrEntity("NFR-001"),
  operationEntity("reservation.create"),
  environmentsEntity(),
];

async function readStack() {
  const s = await readScene(read());
  await seedIndex(read(), s, [], { commit: true, entities: SEEDS() });
  return s;
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.technical.stack.list", () => {
  it("choix complets dans l'ordre de l'index, facettes par couche et par statut", async () => {
    const s = await readStack();
    const res = await technicalApi(read().app, s.world.actors.dev).stack(s.projectId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((item: { specId: string }) => item.specId)).toEqual([
      "ST-web",
      "ST-sms",
    ]);
    expect(res.body.items[1]).toEqual({
      specId: "ST-sms",
      role: "Fournisseur SMS",
      layer: "external",
      icon: "sms",
      status: "open",
      recommended: "Brevo",
      components: ["C-sms"],
      options: ["Brevo", "Twilio"],
      criteria: [{ label: "Prix par SMS", estimate: true, values: ["≈ 0,045 €", "≈ 0,07 €"] }],
      why: "Envoi des rappels.",
      plain: "Le prestataire des rappels reste à choisir.",
      requirements: ["NFR-001"],
      decisions: ["ADR-001"],
      filePath: "stack/ST-sms",
    });
    expect(res.body.items[0]).toMatchObject({ status: "chosen", choice: "Next.js 15" });
    expect(res.body.facets).toEqual({
      layer: { applications: 1, external: 1 },
      status: { chosen: 1, open: 1 },
    });
  });

  it("q cherche par rôle et par identifiant ; around amène un choix ; rien d'indexé : liste vide", async () => {
    const s = await readStack();
    const api = technicalApi(read().app, s.world.actors.dev);
    const byRole = await api.stack(s.projectId, "?q=SMS");
    expect(byRole.body.items.map((i: { specId: string }) => i.specId)).toEqual(["ST-sms"]);
    const around = await api.stack(s.projectId, "?around=ST-sms&limit=1");
    expect(around.body.items[0]?.specId).toBe("ST-sms");
    expect(around.body.offset).toBe(1);
    const empty = await readScene(read());
    const res = await technicalApi(read().app, empty.world.actors.dev).stack(empty.projectId);
    expect(res.body).toMatchObject({ items: [], total: 0 });
  });

  it("compteurs de tête, fiche d'un choix et d'un environnement, autocomplétion des liens", async () => {
    const s = await readStack();
    const head = await specReadApi(read().app, s.world.actors.dev).head(s.projectId);
    expect(head.body.counts).toMatchObject({ stack: 2, nfr: 1, environments: 2, endpoints: 1 });
    const items = itemApi(read().app, s.world.actors.designer);
    const stack = await items.get(s.projectId, "ST-sms", "stack");
    expect(stack.status, JSON.stringify(stack.body)).toBe(200);
    expect(stack.body.values).toMatchObject({ specId: "ST-sms", status: "open" });
    expect(stack.body.validated).toBe(false);
    const env = await items.get(s.projectId, "ENV-recette", "environment");
    expect(env.status, JSON.stringify(env.body)).toBe(200);
    expect(env.body.values).toMatchObject({
      specId: "ENV-recette",
      name: "Recette",
      data: "anonymized",
      deployment: "merge",
      extras: [{ label: "SMS", value: "Numéros de test" }],
    });
    expect((await items.get(s.projectId, "ENV-absent", "environment")).status).toBe(404);
    const refs = await items.search(s.projectId, ["component", "nfr"], "");
    expect(refs.body.items.map((i: { specId: string }) => i.specId).sort()).toEqual([
      "C-sms",
      "NFR-001",
    ]);
  });

  it("source : YAML généré depuis l'index quand le fichier est absent ; choix inconnu : 404", async () => {
    const s = await readStack();
    const api = technicalApi(read().app, s.world.actors.dev);
    const res = await api.source(s.projectId, "ST-sms");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.generated).toBe(true);
    expect(res.body.text).toContain("id: ST-sms");
    expect(res.body.text).not.toContain("titre:");
    expect((await api.source(s.projectId, "ST-absent")).status).toBe(404);
  });
});

const STACK_FILE = emitStackYaml({
  id: "ST-sms",
  couche: "externes",
  role: "Fournisseur SMS",
  statut: "a_trancher",
  recommande: "Brevo",
  options: ["Brevo", "Twilio"],
  criteres: [{ nom: "Prix", valeurs: ["≈ 0,045 €", "≈ 0,07 €"] }],
  pourquoi: "Envoi des rappels.",
});

async function chooseScene(b: SpecBench) {
  const s = await specScene(b);
  const scene = { ...s, organizationId: s.world.organizationId };
  const indexed = scene as unknown as SpecReadScene;
  await b.harness.inner.writeCommit({
    auth: await b.harness.authFor(s.owner),
    repo: s.ref,
    branch: BRANCH,
    author: BOT,
    message: "test: choix technique",
    files: [{ path: "tech/stack/sms.yaml", content: STACK_FILE }],
  });
  await seedIndex(b as unknown as RepoBench, indexed, [], {
    commit: true,
    entities: [stackEntity("ST-sms")],
  });
  b.harness.calls = [];
  return scene;
}

describe("spec.technical.stack.choose", () => {
  it("un lot d'une seule stack.update : choix retenu, statut choisi, un commit", async () => {
    const b = write();
    const s = await chooseScene(b);
    const res = await technicalApi(b.app, s.world.actors.dev).choose(
      s.projectId,
      "ST-sms",
      "Twilio",
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status).toBe("committed");
    expect(res.body.results).toEqual([{ position: 0, kind: "stack.update", specId: "ST-sms" }]);
    const rows = await batchRows(b.database, s.projectId);
    expect(rows).toHaveLength(1);
    expect(await operationRows(b.database, rows[0]?.id ?? "")).toMatchObject([
      {
        kind: "stack.update",
        target_spec_id: "ST-sms",
        payload: { status: "chosen", choice: "Twilio" },
      },
    ]);
    const file = await fileOf(b, s, "tech/stack/sms.yaml");
    expect(file.content).toContain("statut: choisi");
    expect(file.content).toContain("choix: Twilio");
  });

  it("option hors de la liste : 422 sur option ; choix inconnu : 404 ; aucun lot", async () => {
    const b = write();
    const s = await chooseScene(b);
    const api = technicalApi(b.app, s.world.actors.owner);
    const bad = await api.choose(s.projectId, "ST-sms", "Autre");
    expect(bad.status, JSON.stringify(bad.body)).toBe(422);
    expect(bad.body.data.field).toBe("option");
    expect((await api.choose(s.projectId, "ST-absent", "Brevo")).status).toBe(404);
    expect(await batchRows(b.database, s.projectId)).toHaveLength(0);
  });
});
