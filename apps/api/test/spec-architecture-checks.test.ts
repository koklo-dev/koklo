import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertProposal } from "./helpers/proposals.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { entity, readScene, seedIndex } from "./helpers/spec-read.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-111 lot B (cas 4, B506, B511) : `spec.architecture.checks` : avertissements d'architecture jamais bloquants (200), calculés
 * sur l'index de tête plus les propositions `component` et `archflow` en attente du dernier lancement.
 */
const read = installBench({ beforeAll, afterAll, beforeEach });

const table = (id: string) => entity("table", id, id, { id, titre: id, nom: id, champs: [] });
const flow = (id: string) => entity("flow", id, id, { id, titre: id });
const component = (id: string, over: Record<string, unknown> = {}) =>
  entity("component", id, id, {
    id,
    titre: id,
    nom: id,
    type: "service",
    zone: "Noyau",
    responsabilite: "R",
    possede: [],
    sert: [],
    depend_de: [],
    decisions: [],
    ...over,
  });

async function scene(entities: ReturnType<typeof entity>[]) {
  const s = await readScene(read());
  const feature = entity("feature", "F-001", "f", { id: "F-001", titre: "Réserver" });
  await seedIndex(read(), s, [{ id: "F-001", titre: "Réserver" }], {
    commit: true,
    entities: [feature, ...entities],
  });
  return s;
}
const checks = (s: Awaited<ReturnType<typeof readScene>>) =>
  send(
    read().app,
    s.world.actors.dev.cookie,
    "get",
    `/projects/${s.projectId}/spec/architecture/checks`,
  );
const codes = (body: { warnings: { code: string; entityId: string }[] }) =>
  body.warnings.map((w) => `${w.code}:${w.entityId}`);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.architecture.checks", () => {
  it("rien d'indexé : 200 et aucun avertissement", async () => {
    const s = await readScene(read());
    const res = await checks(s);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ warnings: [] });
  });

  it("six avertissements : table sans propriétaire ou à deux, externe propriétaire, fonctionnalité non servie, parcours sans flux, cycle synchrone", async () => {
    const s = await scene([
      table("T-a"),
      table("T-b"),
      table("T-c"),
      flow("P-reserver"),
      component("C-un", { possede: ["T-a", "T-b"], depend_de: [{ vers: "C-deux", via: "HTTP" }] }),
      component("C-deux", {
        type: "ext",
        possede: ["T-b"],
        depend_de: [{ vers: "C-un", via: "HTTP" }],
      }),
    ]);
    const res = await checks(s);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(codes(res.body)).toEqual([
      "ARCH_EXT_OWNS_TABLE:C-deux",
      "ARCH_FEATURE_UNSERVED:F-001",
      "ARCH_FLOW_MISSING:P-reserver",
      "ARCH_SYNC_CYCLE:C-deux",
      "ARCH_TABLE_MULTI_OWNER:T-b",
      "ARCH_TABLE_UNOWNED:T-c",
    ]);
  });

  it("un cycle asynchrone est permis ; un flux technique lève l'avertissement du parcours", async () => {
    const s = await scene([
      flow("P-reserver"),
      entity("archflow", "P-reserver", "f", { id: "P-reserver", titre: "P-reserver" }),
      component("C-un", { sert: ["F-001"], depend_de: [{ vers: "C-deux", via: "AMQP" }] }),
      component("C-deux", {
        sert: ["F-001"],
        depend_de: [{ vers: "C-un", via: "AMQP", mode: "asynchrone" }],
      }),
    ]);
    expect((await checks(s)).body).toEqual({ warnings: [] });
  });

  it("propositions en attente du dernier lancement : une table possédée par une proposition n'est plus orpheline ; accepté ou refusé : ignoré", async () => {
    const s = await scene([table("T-a"), table("T-b"), component("C-un", { sert: ["F-001"] })]);
    const scope = { organizationId: s.organizationId, projectId: s.projectId };
    const proposed = (owns: string[], status = "pending", launchId?: string) =>
      insertProposal(read().database, scope, {
        deliverable: "architecture",
        kind: "component",
        zone: "Noyau",
        title: "Base",
        status,
        payload: { name: "Base", type: "store", zone: "Noyau", responsibility: "R", owns },
        ...(launchId === undefined ? {} : { launchId }),
      });
    expect(codes((await checks(s)).body)).toEqual([
      "ARCH_TABLE_UNOWNED:T-a",
      "ARCH_TABLE_UNOWNED:T-b",
    ]);
    const first = await proposed(["T-a"]);
    await proposed(["T-b"], "rejected", first.launchId);
    expect(codes((await checks(s)).body)).toEqual(["ARCH_TABLE_UNOWNED:T-b"]);
    await proposed(["T-b"], "accepted", first.launchId);
    expect(codes((await checks(s)).body)).toEqual(["ARCH_TABLE_UNOWNED:T-b"]);
  });
});

describe("TK-114b (B615) : spec.architecture.checks et propositions de mise à jour", () => {
  it("une proposition specId remplace le composant indexé : ni double propriétaire, ni table orpheline", async () => {
    const s = await scene([
      table("T-a"),
      table("T-b"),
      component("C-base", { type: "store", possede: ["T-a"], sert: ["F-001"] }),
    ]);
    const scope = { organizationId: s.organizationId, projectId: s.projectId };
    expect(codes((await checks(s)).body)).toEqual(["ARCH_TABLE_UNOWNED:T-b"]);
    await insertProposal(read().database, scope, {
      deliverable: "architecture",
      kind: "component",
      zone: "Données",
      title: "C-base",
      payload: {
        specId: "C-base",
        name: "C-base",
        type: "store",
        zone: "Noyau",
        responsibility: "Mise à jour des liens du composant.",
        owns: ["T-a", "T-b"],
        serves: ["F-001"],
      },
    });
    expect(codes((await checks(s)).body)).toEqual([]);
  });
});
