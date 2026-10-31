import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ROLES } from "./helpers/organizations.ts";
import { installBench } from "./helpers/repo-scene.ts";
import {
  auditTotal,
  readScene,
  type SpecReadScene,
  seedIndex,
  specReadApi,
} from "./helpers/spec-read.ts";
import { createWorld, insertProject } from "./helpers/tickets.ts";

/** TK-45c2 : lectures spec.* ouvertes aux six rôles de leur projet, NOT_FOUND hors périmètre, aucune écriture. */
const bench = installBench({ beforeAll, afterAll, beforeEach });

const FEATURE = {
  id: "F-001",
  titre: "Connexion",
  description: "Se connecter.",
  criteres: [{ titre: "Mot de passe valide" }],
};

async function indexed(): Promise<{ s: SpecReadScene; sha: string }> {
  const b = bench();
  const s = await readScene(b);
  const { sha } = await seedIndex(b, s, [FEATURE], { commit: true });
  return { s, sha };
}

describe("spec.* : les six rôles lisent leur projet", () => {
  it.each(ROLES)("%s lit head, listFeatures et getFeature (200)", async (role) => {
    const { s, sha } = await indexed();
    const api = specReadApi(bench().app, s.world.actors[role]);

    const head = await api.head(s.projectId);
    const list = await api.list(s.projectId);
    const one = await api.get(s.projectId, "F-001");

    expect(head.status, JSON.stringify(head.body)).toBe(200);
    expect(head.body.commitSha).toBe(sha);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body.items.map((i: { specId: string }) => i.specId)).toEqual(["F-001"]);
    expect(one.status, JSON.stringify(one.body)).toBe(200);
    expect(one.body.specId).toBe("F-001");
  });

  it("sans session : 401 sur les trois procédures", async () => {
    const { s } = await indexed();
    const api = specReadApi(bench().app, undefined);

    for (const res of [
      await api.head(s.projectId),
      await api.list(s.projectId),
      await api.get(s.projectId, "F-001"),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("UNAUTHORIZED");
    }
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.* : anti-IDOR (NOT_FOUND, jamais FORBIDDEN)", () => {
  async function foreignCaller() {
    const foreign = await createWorld(bench().database);
    return specReadApi(bench().app, foreign.actors.owner);
  }

  it.each(["head", "list", "get"] as const)(
    "%s : le projet d'une autre organisation est introuvable et rien ne fuit",
    async (name) => {
      const { s, sha } = await indexed();
      const api = await foreignCaller();

      const res = await (name === "get" ? api.get(s.projectId, "F-001") : api[name](s.projectId));

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(sha);
      expect(text).not.toContain("Connexion");
    },
  );

  it.each(["head", "list", "get"] as const)(
    "%s : un projet inexistant est introuvable (même réponse qu'un projet étranger)",
    async (name) => {
      const { s } = await indexed();
      const api = specReadApi(bench().app, s.world.actors.owner);
      const unknown = randomUUID();

      const res = await (name === "get" ? api.get(unknown, "F-001") : api[name](unknown));

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    },
  );

  it("getFeature : specId inexistant dans le projet = NOT_FOUND, sans appel au fournisseur", async () => {
    const { s } = await indexed();
    const b = bench();
    b.harness.calls = [];

    const res = await specReadApi(b.app, s.world.actors.dev).get(s.projectId, "F-404");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(b.harness.calls).toEqual([]);
  });

  it("getFeature : un specId d'un autre projet de la même organisation est introuvable", async () => {
    const { s } = await indexed();
    const b = bench();
    const otherProject = await insertProject(b.database, s.organizationId, "Autre projet");
    const other = await readScene(b, { world: s.world, projectId: otherProject });
    await seedIndex(b, other, [{ id: "F-777", titre: "Secrète" }], { commit: true });

    const res = await specReadApi(b.app, s.world.actors.dev).get(s.projectId, "F-777");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(JSON.stringify(res.body)).not.toContain("Secrète");
  });
});

describe("spec.* : lectures pures", () => {
  it("aucune entrée d'audit n'est écrite par head, listFeatures ni getFeature", async () => {
    const { s } = await indexed();
    const b = bench();
    const before = await auditTotal(b.database, s.organizationId);
    const api = specReadApi(b.app, s.world.actors.owner);

    const responses = [
      await api.head(s.projectId),
      await api.list(s.projectId),
      await api.get(s.projectId, "F-001"),
    ];

    expect(responses.map((res) => res.status)).toEqual([200, 200, 200]);
    expect(await auditTotal(b.database, s.organizationId)).toBe(before);
  });

  it("head et listFeatures ne parlent jamais au fournisseur (index seul)", async () => {
    const { s } = await indexed();
    const b = bench();
    b.harness.calls = [];
    const api = specReadApi(b.app, s.world.actors.client);

    const responses = [await api.head(s.projectId), await api.list(s.projectId)];

    expect(responses.map((res) => res.status)).toEqual([200, 200]);
    expect(b.harness.calls).toEqual([]);
  });
});
