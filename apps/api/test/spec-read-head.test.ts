import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import { insertProjectRepo } from "./helpers/repos.ts";
import {
  moveHead,
  readScene,
  type SpecReadScene,
  seedIndex,
  specReadApi,
} from "./helpers/spec-read.ts";
import { createWorld } from "./helpers/tickets.ts";

/** TK-45c2 : spec.head (tête indexée d'une branche, null tant qu'elle ne l'est pas, branche par défaut). */
const bench = installBench({ beforeAll, afterAll, beforeEach });

const A = { id: "F-001", titre: "Un" };
const B = { id: "F-002", titre: "Deux" };

const headOf = (s: SpecReadScene, query = "") =>
  specReadApi(bench().app, s.world.actors.dev).head(s.projectId, query);

describe("spec.head : forme et comptes", () => {
  it("rend { branch, commitSha, status, errorCode, indexedAt, counts } d'après l'index", async () => {
    const s = await readScene(bench());
    const { sha } = await seedIndex(bench(), s, [A, B], {
      tables: ["T-user"],
      endpoints: [
        { id: "E-login", method: "POST", path: "/login" },
        { id: "E-logout", method: "POST", path: "/logout" },
        { id: "E-me", method: "GET", path: "/me" },
      ],
      indexedAt: "2026-10-31T10:00:00.000Z",
    });

    const res = await headOf(s);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      branch: "cadrage",
      commitSha: sha,
      status: "ready",
      errorCode: null,
      indexedAt: "2026-10-31T10:00:00.000Z",
      counts: { features: 2, tables: 1, endpoints: 3 },
    });
  });

  it("expose le statut et le code d'un instantané failed (la tête pointe quand même dessus)", async () => {
    const s = await readScene(bench());
    const { sha } = await seedIndex(bench(), s, [], {
      status: "failed",
      errorCode: "spec_too_large",
    });

    const res = await headOf(s);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      commitSha: sha,
      status: "failed",
      errorCode: "spec_too_large",
      counts: { features: 0, tables: 0, endpoints: 0 },
    });
  });

  it("rend le statut building tel quel", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, [A], { status: "building" });

    const res = await headOf(s);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("building");
  });
});

describe("spec.head : null tant que rien n'est indexé", () => {
  it("projet dont le dépôt n'a aucune tête : 200 null", async () => {
    const s = await readScene(bench());

    const res = await headOf(s);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("projet sans aucun dépôt : 200 null (et non 404)", async () => {
    const world = await createWorld(bench().database);

    const res = await specReadApi(bench().app, world.actors.dev).head(world.projectId);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("projet dont le seul dépôt n'est pas porteur de la spec (rôle front) : 200 null", async () => {
    const b = bench();
    const world = await createWorld(b.database);
    const s = await readScene(b, { world });
    await b.database.query("UPDATE project_repos SET role = 'front' WHERE id = $1", [s.repoId]);
    await seedIndex(b, s, [A]);

    const res = await headOf(s);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("branche inconnue : 200 null", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, [A]);

    const res = await headOf(s, "?branch=feature%2Finconnue");

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.head : choix de la révision", () => {
  it("par défaut : cadrage s'il a une tête, même si la branche par défaut en a une", async () => {
    const s = await readScene(bench());
    const main = await seedIndex(bench(), s, [A], { branch: "main" });
    const cadrage = await seedIndex(bench(), s, [A, B], { branch: "cadrage" });

    const res = await headOf(s);

    expect(res.body.branch).toBe("cadrage");
    expect(res.body.commitSha).toBe(cadrage.sha);
    expect(res.body.commitSha).not.toBe(main.sha);
  });

  it("par défaut sans tête cadrage : la branche par défaut du dépôt", async () => {
    const s = await readScene(bench());
    const [repo] = await bench().database.query<{ default_branch: string }>(
      "SELECT default_branch FROM project_repos WHERE id = $1",
      [s.repoId],
    );
    const main = await seedIndex(bench(), s, [A], { branch: repo?.default_branch ?? "main" });

    const res = await headOf(s);

    expect(res.body.branch).toBe(repo?.default_branch);
    expect(res.body.commitSha).toBe(main.sha);
  });

  it("?branch= rend la tête de cette branche", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, [A], { branch: "cadrage" });
    const other = await seedIndex(bench(), s, [A, B], { branch: "change-1" });

    const res = await headOf(s, "?branch=change-1");

    expect(res.body.branch).toBe("change-1");
    expect(res.body.commitSha).toBe(other.sha);
    expect(res.body.counts.features).toBe(2);
  });

  it("?commitSha= rend l'instantané de ce commit avec une branche qui le pointe", async () => {
    const s = await readScene(bench());
    const { sha } = await seedIndex(bench(), s, [A], { branch: "change-1" });

    const res = await headOf(s, `?commitSha=${sha}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.commitSha).toBe(sha);
    expect(res.body.branch).toBe("change-1");
  });

  it("?commitSha= d'un instantané qu'aucune branche ne pointe : branch = chaîne vide", async () => {
    const s = await readScene(bench());
    const { sha } = await seedIndex(bench(), s, [A], { noHead: true });

    const res = await headOf(s, `?commitSha=${sha}`);

    expect(res.status).toBe(200);
    expect(res.body.commitSha).toBe(sha);
    expect(res.body.branch).toBe("");
  });

  it("?commitSha= inconnu : 200 null", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, [A]);

    const res = await headOf(s, `?commitSha=${"a".repeat(40)}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("branch et commitSha ensemble : 422 VALIDATION, rien n'est lu", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, [A]);

    const res = await headOf(s, `?branch=cadrage&commitSha=${"a".repeat(40)}`);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
  });

  it("?commitSha= d'un instantané d'un autre dépôt (autre projet) : null", async () => {
    const b = bench();
    const mine = await readScene(b);
    const world = await createWorld(b.database);
    const theirs = await readScene(b, { world });
    const { sha } = await seedIndex(b, theirs, [A]);

    const res = await headOf(mine, `?commitSha=${sha}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

describe("spec.head : retard puis rattrapage", () => {
  it("après un commit, la tête garde l'ancien SHA jusqu'à ce que l'index soit reconstruit", async () => {
    const b = bench();
    const s = await readScene(b);
    const first = await seedIndex(b, s, [A]);
    const second = await seedIndex(b, s, [A, B], { noHead: true });

    const lagging = await headOf(s);
    await moveHead(b.database, s, "cadrage", second.snapshotId);
    const caughtUp = await headOf(s);

    expect(lagging.body.commitSha).toBe(first.sha);
    expect(caughtUp.body.commitSha).toBe(second.sha);
    expect(caughtUp.body.counts.features).toBe(2);
  });

  it("un dépôt front lié en plus ne perturbe pas la lecture de la spec", async () => {
    const b = bench();
    const s = await readScene(b);
    await seedIndex(b, s, [A]);
    await insertProjectRepo(b.database, s.organizationId, s.projectId, s.installation.id, {
      role: "front",
      name: "front-repo",
    });

    const res = await headOf(s);

    expect(res.body.commitSha).toHaveLength(40);
    expect(res.body.counts.features).toBe(1);
  });
});
