import type { Role } from "@koklo/contract";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditRowsFull } from "./helpers/comments.ts";
import { installBench, scene } from "./helpers/repo-scene.ts";
import { insertInstallation, projectRepoRows, repoApi } from "./helpers/repos.ts";
import { createWorld } from "./helpers/tickets.ts";

/** TK-43 CA4 et CA5 : matrice de rôles (CDC §14) et appartenance, avant tout appel réseau. */
const bench = installBench({ beforeAll, afterAll, beforeEach });

type Api = ReturnType<typeof repoApi>;
type Write = "createSpec" | "link";
const WRITES: Write[] = ["createSpec", "link"];
const MANAGE_ALLOWED: Role[] = ["owner", "admin"];
const MANAGE_DENIED: Role[] = ["dev", "designer", "client", "business"];
const LIST_ALLOWED: Role[] = ["owner", "admin", "dev", "designer"];
const LIST_DENIED: Role[] = ["client", "business"];

/** Appelle la procédure d'écriture ; `link` vise un repo réellement présent chez le fournisseur. */
async function invoke(api: Api, write: Write, projectId: string, installation: string, login = "") {
  if (write === "createSpec") return api.createSpec(projectId, installation);
  return api.link(projectId, installation, { ownerLogin: login, name: "demo" });
}

async function writable(write: Write) {
  const b = bench();
  const s = await scene(b);
  if (write === "link") await b.harness.seedRepo(s.owner, "demo");
  b.harness.calls = [];
  return { b, ...s };
}

describe.each(WRITES)("repo.%s : rôles autorisés", (write) => {
  it.each(MANAGE_ALLOWED)("%s réussit", async (role) => {
    const { world, installation, owner } = await writable(write);
    const res = await invoke(
      repoApi(bench().app, world.actors[role]),
      write,
      world.projectId,
      installation.id,
      owner.login,
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

describe.each(WRITES)("repo.%s : rôles refusés", (write) => {
  it.each(MANAGE_DENIED)(
    "%s reçoit FORBIDDEN : aucun appel fournisseur, ligne ni audit",
    async (role) => {
      const { b, world, installation, owner } = await writable(write);
      const res = await invoke(
        repoApi(b.app, world.actors[role]),
        write,
        world.projectId,
        installation.id,
        owner.login,
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
      expect(b.harness.calls).toEqual([]);
      expect(await projectRepoRows(b.database, world.organizationId)).toEqual([]);
      const audit = await auditRowsFull(b.database, world.organizationId);
      expect(audit.filter((entry) => entry.action.startsWith("repo."))).toEqual([]);
    },
  );

  it("sans session : 401 UNAUTHORIZED, aucun appel fournisseur", async () => {
    const { b, world, installation, owner } = await writable(write);
    const res = await invoke(
      repoApi(b.app, undefined),
      write,
      world.projectId,
      installation.id,
      owner.login,
    );
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
    expect(b.harness.calls).toEqual([]);
  });

  it("le refus de rôle précède l'appartenance : même 403 pour un projet d'une autre organisation", async () => {
    const { b, world, installation } = await writable(write);
    const other = await createWorld(b.database);
    const res = await invoke(
      repoApi(b.app, world.actors.client),
      write,
      other.projectId,
      installation.id,
    );
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });
});

describe("repo.list : rôles", () => {
  it.each(LIST_ALLOWED)("%s lit la liste", async (role) => {
    const { world } = await scene(bench());
    const res = await repoApi(bench().app, world.actors[role]).list(world.projectId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual([]);
  });

  it.each(LIST_DENIED)("%s reçoit FORBIDDEN", async (role) => {
    const { world } = await scene(bench());
    const res = await repoApi(bench().app, world.actors[role]).list(world.projectId);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("sans session : 401 UNAUTHORIZED", async () => {
    const { world } = await scene(bench());
    const res = await repoApi(bench().app, undefined).list(world.projectId);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });
});

const UNKNOWN = "0197a2b4-0000-7000-8000-000000000000";

function expectNotFound(res: { status: number; body: { code?: string } }, calls: unknown[]) {
  expect(res.status).toBe(404);
  expect(res.body.code).toBe("NOT_FOUND");
  expect(calls).toEqual([]);
}

/** Appel du propriétaire sur un couple projet/installation donné. */
async function asOwner(write: Write, project: (w: string) => string, installation: string) {
  const s = await writable(write);
  const res = await invoke(
    repoApi(s.b.app, s.world.actors.owner),
    write,
    project(s.world.projectId),
    installation === "own" ? s.installation.id : installation,
    s.owner.login,
  );
  return { ...s, res };
}

describe.each(WRITES)(
  "repo.%s : projet hors organisation, NOT_FOUND avant tout réseau",
  (write) => {
    it("projet d'une autre organisation", async () => {
      const s = await writable(write);
      const other = await createWorld(s.b.database);
      const res = await invoke(
        repoApi(s.b.app, s.world.actors.owner),
        write,
        other.projectId,
        s.installation.id,
        s.owner.login,
      );
      expectNotFound(res, s.b.harness.calls);
      expect(await projectRepoRows(s.b.database, other.organizationId)).toEqual([]);
    });

    it("projet inexistant", async () => {
      const { res, b } = await asOwner(write, () => UNKNOWN, "own");
      expectNotFound(res, b.harness.calls);
    });
  },
);

describe.each(WRITES)(
  "repo.%s : installation étrangère ou inactive, NOT_FOUND avant tout réseau",
  (write) => {
    it("installation d'une autre organisation", async () => {
      const s = await writable(write);
      const other = await createWorld(s.b.database);
      const foreign = await insertInstallation(s.b.database, other.organizationId, {
        ownerLogin: s.owner.login,
      });
      const { res } = await asOwner(write, (id) => id, foreign.id);
      expectNotFound(res, s.b.harness.calls);
    });

    it("installation inexistante", async () => {
      const { res, b } = await asOwner(write, (id) => id, UNKNOWN);
      expectNotFound(res, b.harness.calls);
    });

    it.each(["suspended", "deleted"] as const)("installation %s", async (status) => {
      const s = await writable(write);
      const inactive = await insertInstallation(s.b.database, s.world.organizationId, {
        status,
        ownerLogin: s.owner.login,
      });
      const res = await invoke(
        repoApi(s.b.app, s.world.actors.owner),
        write,
        s.world.projectId,
        inactive.id,
        s.owner.login,
      );
      expectNotFound(res, s.b.harness.calls);
    });
  },
);

describe("repo.list : projet hors organisation", () => {
  it("NOT_FOUND pour un projet d'une autre organisation ou inexistant", async () => {
    const { world } = await scene(bench());
    const other = await createWorld(bench().database);
    const api = repoApi(bench().app, world.actors.owner);
    for (const projectId of [other.projectId, UNKNOWN]) {
      const res = await api.list(projectId);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
  });
});
