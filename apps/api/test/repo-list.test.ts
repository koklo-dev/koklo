import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench, scene } from "./helpers/repo-scene.ts";
import { insertInstallation, insertProjectRepo, repoApi } from "./helpers/repos.ts";
import { createWorld, insertProject } from "./helpers/tickets.ts";

/** TK-43 CA12 : repo.list (lecture base seule, isolation par projet et par organisation). */
const bench = installBench({ beforeAll, afterAll, beforeEach });

describe("repo.list", () => {
  it("rend les repos du projet, triés par création puis id, sans identifiant externe", async () => {
    const b = bench();
    const { world, installation, api } = await scene(b);
    const second = await insertProjectRepo(
      b.database,
      world.organizationId,
      world.projectId,
      installation.id,
      {
        name: "b-repo",
        createdAt: "2026-02-01T00:00:00.000Z",
        role: "back",
      },
    );
    const first = await insertProjectRepo(
      b.database,
      world.organizationId,
      world.projectId,
      installation.id,
      {
        name: "a-repo",
        createdAt: "2026-01-01T00:00:00.000Z",
        role: "spec",
        mode: "new",
        external_id: "EXTERNE-SECRET-123",
      },
    );

    const res = await api.list(world.projectId);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.map((repo: { id: string }) => repo.id)).toEqual([first, second]);
    expect(res.body[0]).toEqual({
      id: first,
      projectId: world.projectId,
      installationId: installation.id,
      role: "spec",
      mode: "new",
      ownerLogin: "acme",
      name: "a-repo",
      defaultBranch: "main",
      specPath: null,
    });
    expect(JSON.stringify(res.body)).not.toContain("EXTERNE-SECRET-123");
  });
});

describe("repo.list : isolation", () => {
  it("n'inclut ni les repos d'un autre projet, ni ceux d'une autre organisation", async () => {
    const b = bench();
    const { world, installation, api } = await scene(b);
    const otherProject = await insertProject(b.database, world.organizationId, "Autre projet");
    await insertProjectRepo(b.database, world.organizationId, otherProject, installation.id, {
      name: "autre-projet",
    });
    const foreign = await createWorld(b.database);
    const foreignInstallation = await insertInstallation(b.database, foreign.organizationId);
    await insertProjectRepo(
      b.database,
      foreign.organizationId,
      foreign.projectId,
      foreignInstallation.id,
      { name: "etranger" },
    );
    const mine = await insertProjectRepo(
      b.database,
      world.organizationId,
      world.projectId,
      installation.id,
      { name: "mien" },
    );

    const res = await api.list(world.projectId);

    expect(res.body.map((repo: { id: string }) => repo.id)).toEqual([mine]);
    expect((await repoApi(b.app, foreign.actors.owner).list(foreign.projectId)).body).toHaveLength(
      1,
    );
  });
});

describe("repo.list : base seule", () => {
  it("lit la base seule : aucun appel au fournisseur", async () => {
    const b = bench();
    const { world, installation, api } = await scene(b);
    await insertProjectRepo(b.database, world.organizationId, world.projectId, installation.id);
    const res = await api.list(world.projectId);
    expect(res.status).toBe(200);
    expect(b.harness.calls).toEqual([]);
  });
});
