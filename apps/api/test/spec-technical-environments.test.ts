import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import { readScene, seedIndex } from "./helpers/spec-read.ts";
import { environmentsEntity, technicalApi } from "./helpers/spec-technical.ts";

/**
 * TK-115 lot B (B722) : onglet Environnements. Le fichier `tech/environments.yaml` indexé est rendu tel quel au
 * vocabulaire du contrat : environnements, variables (nom et usage seulement) et intégrations.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });

describe("spec.technical.environments", () => {
  it("environnements dans l'ordre du fichier, variables sans valeur, intégrations", async () => {
    const s = await readScene(bench());
    const { sha } = await seedIndex(bench(), s, [], {
      commit: true,
      entities: [
        environmentsEntity({
          variables: [{ nom: "DATABASE_URL", usage: "Connexion", valeur: "jamais-rendue" }],
        }),
      ],
    });
    const res = await technicalApi(bench().app, s.world.actors.designer).environments(s.projectId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.commitSha).toBe(sha);
    expect(res.body.environments).toEqual([
      {
        specId: "ENV-developpement",
        name: "Développement",
        address: "localhost:3000",
        hosting: "Poste du développeur",
        database: "PostgreSQL local",
        data: "sample",
        extras: [],
      },
      {
        specId: "ENV-recette",
        name: "Recette",
        address: "recette.exemple.fr",
        hosting: "Hébergeur, Paris",
        database: "PostgreSQL géré",
        data: "anonymized",
        deployment: "merge",
        access: "Équipe et client",
        extras: [{ label: "SMS", value: "Numéros de test" }],
      },
    ]);
    expect(res.body.variables).toEqual([{ name: "DATABASE_URL", usage: "Connexion" }]);
    expect(res.body.integrations).toEqual([
      { service: "SMS", usage: "Rappels", status: "to_choose" },
    ]);
    expect(JSON.stringify(res.body)).not.toContain("jamais-rendue");
  });

  it("rien d'indexé, ou aucun fichier : listes vides", async () => {
    const s = await readScene(bench());
    const api = technicalApi(bench().app, s.world.actors.dev);
    const empty = { environments: [], variables: [], integrations: [] };
    expect((await api.environments(s.projectId)).body).toEqual({ ...empty, commitSha: null });
    const { sha } = await seedIndex(bench(), s, [], { commit: true, entities: [] });
    expect((await api.environments(s.projectId)).body).toEqual({ ...empty, commitSha: sha });
  });
});
