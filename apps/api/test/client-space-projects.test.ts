import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  clientSpaceApi,
  createSpaceScene,
  type SpaceScene,
  seedTaggedBaseline,
} from "./helpers/client-space.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { shellApi } from "./helpers/shell.ts";
import { seedIndex } from "./helpers/spec-read.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-55b : `clientSpace.projects`. Un client lié ne voit que ses projets ; les rôles d'équipe et le
 * business toute l'organisation ; jamais un projet d'une autre organisation. `phase` vaut `iteration`
 * ssi une baseline taguée existe.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
const STAFF = ["owner", "admin", "dev", "designer", "business"] as const;

let scene: SpaceScene;
beforeEach(async () => {
  scene = await createSpaceScene(bench());
});

const projectsOf = (actor: { cookie: string }) => clientSpaceApi(bench().app, actor).projects();
const idsOf = (body: { id: string }[]) => body.map((p) => p.id);

describe("clientSpace.projects : un client ne voit que ses projets liés", () => {
  it("client lié à p1 : seulement p1, avec exactement id, name, phase", async () => {
    const res = await projectsOf(scene.c1);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual([{ id: scene.p1.projectId, name: "Projet", phase: "framing" }]);
  });

  it("deux clients de la même organisation ne se voient pas", async () => {
    const one = await projectsOf(scene.c1);
    const two = await projectsOf(scene.c2);

    expect(idsOf(one.body)).toEqual([scene.p1.projectId]);
    expect(idsOf(two.body)).toEqual([scene.p2.projectId]);
    expect(JSON.stringify(one.body)).not.toContain("Projet deux");
  });

  it("client sans aucun lien : 200 et liste vide, jamais une erreur", async () => {
    const res = await projectsOf(scene.c3);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("ne montre jamais le projet d'une autre organisation : un client étranger ne voit que le sien", async () => {
    const res = await projectsOf(scene.foreign.world.actors.client);

    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toEqual([scene.foreign.projectId]);
    expect(JSON.stringify(res.body)).not.toContain(scene.p1.projectId);
    expect(JSON.stringify((await projectsOf(scene.c1)).body)).not.toContain(
      scene.foreign.projectId,
    );
  });

  it("le lien est relu à chaque requête : supprimé, le projet disparaît aussitôt", async () => {
    expect(idsOf((await projectsOf(scene.c1)).body)).toEqual([scene.p1.projectId]);
    await bench().database.query("DELETE FROM project_client_access WHERE user_id = $1", [
      scene.c1.userId,
    ]);

    expect((await projectsOf(scene.c1)).body).toEqual([]);
  });

  it("sans session : 401", async () => {
    const res = await send(bench().app, undefined, "get", "/client-space/projects");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });
});

describe("clientSpace.projects : rôles d'équipe et business", () => {
  it.each(STAFF)(
    "%s voit les deux projets de son organisation, dans l'ordre de création",
    async (role) => {
      const res = await projectsOf(scene.p1.world.actors[role]);

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(idsOf(res.body)).toEqual([scene.p1.projectId, scene.p2.projectId]);
      expect(res.body.every((p: object) => Object.keys(p).sort().join() === "id,name,phase")).toBe(
        true,
      );
      expect(JSON.stringify(res.body)).not.toContain(scene.foreign.projectId);
    },
  );
});

describe("clientSpace.projects : phase", () => {
  it("framing sans baseline ; iteration dès qu'une baseline est taguée, par projet", async () => {
    const b = bench();
    const { sha } = await seedIndex(b, scene.p1, [{ id: "F-001" }]);
    await seedTaggedBaseline(b.database, scene.p1, sha);

    const one = await projectsOf(scene.c1);
    const two = await projectsOf(scene.c2);

    expect(one.body[0].phase).toBe("iteration");
    expect(two.body[0].phase).toBe("framing");
  });

  it("phase unique (TK-92, B272) : une baseline validée, pas encore taguée, donne aussi iteration, comme project.shell", async () => {
    const b = bench();
    const { sha } = await seedIndex(b, scene.p1, [{ id: "F-001" }]);
    await seedTaggedBaseline(b.database, scene.p1, sha);
    await b.database.query(
      "UPDATE baselines SET status = 'validated', tag_sha = NULL, tagged_at = NULL WHERE project_id = $1",
      [scene.p1.projectId],
    );

    expect((await projectsOf(scene.c1)).body[0].phase).toBe("iteration");
    const shell = await shellApi(b.app, scene.p1.world.actors.owner).shell(scene.p1.projectId);
    expect(shell.body.phase).toBe("iterations");
  });

  it("un projet sans fonctionnalité ni version : framing côté client (idea et framing se confondent)", async () => {
    const b = bench();
    expect((await projectsOf(scene.c2)).body[0].phase).toBe("framing");
    const shell = await shellApi(b.app, scene.p1.world.actors.owner).shell(scene.p2.projectId);
    expect(shell.body.phase).toBe("idea");
  });

  it("une baseline seulement proposée ne ferme pas le cadrage", async () => {
    const b = bench();
    await b.database.query(
      `INSERT INTO baselines (id, organization_id, project_id, repo_id, number, status, proposed_sha, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 0, 'proposed', $4, now(), now())`,
      [scene.p2.organizationId, scene.p2.projectId, scene.p2.repoId, "c".repeat(40)],
    );

    expect((await projectsOf(scene.c2)).body[0].phase).toBe("framing");
  });
});
