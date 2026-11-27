import { emitRolesYaml, emitTableYaml } from "@koklo/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RepoBench } from "./helpers/repo-scene.ts";
import {
  BOT,
  BRANCH,
  fileOf,
  filesOf,
  headOf,
  installSpecBench,
  type SpecBench,
  specScene,
} from "./helpers/spec-batch.ts";
import { type SpecReadScene, seedIndex } from "./helpers/spec-read.ts";
import { securityApi, tableEntity } from "./helpers/spec-security.ts";

/**
 * TK-117 lot B (cas 2, B793, B807) : de la page au dépôt. Un lot d'une opération écrit le fichier de la menace ou la
 * donnée classée, la matrice et les scénarios d'abus dans le même commit, avec le worker réel.
 */
const write = installSpecBench({ beforeAll, afterAll, beforeEach });

const FILES = [
  {
    path: "koklo.project.yaml",
    content: "projet: demo\norganisation: acme\nspec_version: 2\n",
  },
  {
    path: "data/tables/clientes.yaml",
    content: emitTableYaml({
      id: "T-clientes",
      nom: "Clientes",
      zone: "Clientèle",
      champs: [{ nom: "telephone", type: "texte(20)", cle: "primaire" }],
    }),
  },
  {
    path: "domain/roles.yaml",
    content: emitRolesYaml({
      permissions: [
        {
          id: "PM-client.lire",
          ressource: "client",
          action: "lire",
          conditions: [],
          endpoints: [],
        },
      ],
      roles: [{ id: "RL-accueil", nom: "Accueil", description: "Accueil", permissions: [] }],
    }),
  },
];

async function scene(b: SpecBench) {
  const s = await specScene(b);
  const indexed = { ...s, organizationId: s.world.organizationId } as unknown as SpecReadScene;
  await b.harness.inner.writeCommit({
    auth: await b.harness.authFor(s.owner),
    repo: s.ref,
    branch: BRANCH,
    author: BOT,
    message: "test: état de la spec",
    files: FILES,
  });
  await seedIndex(b as unknown as RepoBench, indexed, [], {
    commit: true,
    entities: [tableEntity("clientes", ["telephone"])],
  });
  return { ...indexed, ...s, projectId: s.projectId };
}

describe("écritures de la Sécurité jusqu'au dépôt", () => {
  it("menace : fichier, matrice et scénarios d'abus dans un seul commit", async () => {
    const b = write();
    const s = await scene(b);
    const before = await headOf(b, s);
    const res = await securityApi(b.app, s.world.actors.dev).createThreat(s.projectId, {
      surfaces: ["api"],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status).toBe("committed");
    expect(res.body.results).toEqual([{ position: 0, kind: "threat.create", specId: "SEC-T01" }]);
    const files = await filesOf(b, s);
    expect(files).toEqual(
      expect.arrayContaining([
        "security/threats/SEC-T01.yaml",
        "security/rights.yaml",
        "quality/scenarios/abuse/SEC-T01.feature",
        "quality/scenarios/abuse/droits-accueil.feature",
      ]),
    );
    expect(await headOf(b, s)).not.toEqual(before);
    const feature = await fileOf(b, s, "quality/scenarios/abuse/SEC-T01.feature");
    expect(feature.content).toContain("@SEC-T01 @api @abus");
  });

  it("donnée classée sans proposition : security/data.yaml écrit", async () => {
    const b = write();
    const s = await scene(b);
    const res = await securityApi(b.app, s.world.actors.owner).classify(s.projectId, {
      data: "Téléphone",
      fields: ["clientes.telephone"],
      category: "contact",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status).toBe("committed");
    const file = await fileOf(b, s, "security/data.yaml");
    expect(file.content).toContain("clientes.telephone");
    expect(file.content).not.toContain("conservation");
  });
});
