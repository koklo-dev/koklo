import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import {
  rightsEntity,
  securityApi,
  securityRoles,
  securityScene,
} from "./helpers/spec-security.ts";

/**
 * TK-117 lot B (B794, B813) : matrice des droits. Actions = permissions des rôles, cases oui, non, restreint (rôle et
 * Sécurité fusionnés), règles de propriété du fichier, un scénario d'abus par case non ou restreinte.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });

describe("security.rights.get", () => {
  it("matrice, fusion des restrictions et compte des scénarios d'abus", async () => {
    const s = await securityScene(bench(), [
      securityRoles(),
      rightsEntity({
        restrictions: [
          {
            role: "RL-gerante",
            permission: "PM-client.exporter",
            restriction: "avec second facteur",
          },
        ],
      }),
    ]);
    const res = await securityApi(bench().app, s.world.actors.designer).rights(s.projectId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.roles).toEqual([
      { id: "RL-accueil", name: "Accueil" },
      { id: "RL-gerante", name: "Gérante" },
    ]);
    expect(res.body.actions).toEqual([
      {
        id: "PM-client.lire",
        label: "Lire les clientes",
        cells: [
          { role: "RL-accueil", access: "restricted", restriction: "du jour" },
          { role: "RL-gerante", access: "yes" },
        ],
      },
      {
        id: "PM-client.exporter",
        label: "exporter client",
        cells: [
          { role: "RL-accueil", access: "no" },
          { role: "RL-gerante", access: "restricted", restriction: "avec second facteur" },
        ],
      },
    ]);
    expect(res.body.abuseScenarios).toBe(3);
    expect(res.body.ownershipRules).toEqual(["Chacun ne voit que son salon."]);
    expect(res.body.restrictions).toHaveLength(1);
    expect(res.body.commitSha).toBe(s.sha);
  });

  it("aucun rôle au cahier fonctionnel : matrice vide", async () => {
    const s = await securityScene(bench(), []);
    const res = await securityApi(bench().app, s.world.actors.owner).rights(s.projectId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ roles: [], actions: [], abuseScenarios: 0 });
  });
});
