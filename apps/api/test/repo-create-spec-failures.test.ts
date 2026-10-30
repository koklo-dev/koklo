import { GitProviderUnavailableError } from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditRowsFull } from "./helpers/comments.ts";
import { installBench, scene } from "./helpers/repo-scene.ts";
import { DEFAULT_REPO_NAME, insertProjectRepo, projectRepoRows } from "./helpers/repos.ts";

/** TK-43 CA6, CA7, CA10 : idempotence, conflits, nom invalide, échec partiel et atomicité de l'audit. */
const bench = installBench({ beforeAll, afterAll, beforeEach });

const auditCount = async (organizationId: string, action: string) =>
  (await auditRowsFull(bench().database, organizationId)).filter((e) => e.action === action).length;

describe("CA6 idempotence : le second appel est refusé avant tout réseau", () => {
  it("CONFLICT spec_repo_exists, aucun appel au fournisseur, une ligne, un audit", async () => {
    const b = bench();
    const { world, installation, api } = await scene(b);
    expect((await api.createSpec(world.projectId, installation.id)).status).toBe(200);
    b.harness.calls = [];

    const second = await api.createSpec(world.projectId, installation.id);

    expect(second.status).toBe(409);
    expect(second.body.code).toBe("CONFLICT");
    expect(second.body.data).toEqual({ reason: "spec_repo_exists" });
    expect(b.harness.calls).toEqual([]);
    expect(await projectRepoRows(b.database, world.organizationId)).toHaveLength(1);
    expect(await auditCount(world.organizationId, "repo.createSpec")).toBe(1);
  });

  it("un monorepo qui porte déjà la spec (spec_path) bloque aussi la création", async () => {
    const b = bench();
    const { world, installation, api } = await scene(b);
    await insertProjectRepo(b.database, world.organizationId, world.projectId, installation.id, {
      role: "monorepo",
      spec_path: "spec",
    });
    const res = await api.createSpec(world.projectId, installation.id);
    expect(res.status).toBe(409);
    expect(res.body.data).toEqual({ reason: "spec_repo_exists" });
    expect(b.harness.calls).toEqual([]);
  });
});

describe("CA6 repo_name_taken : le nom existe déjà chez le fournisseur", () => {
  it("CONFLICT repo_name_taken, ni ligne ni audit, ni commit ni branche", async () => {
    const b = bench();
    const { world, installation, api, owner } = await scene(b);
    await b.harness.seedRepo(owner, DEFAULT_REPO_NAME);

    const res = await api.createSpec(world.projectId, installation.id);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
    expect(res.body.data).toEqual({ reason: "repo_name_taken" });
    expect(b.harness.names()).not.toContain("writeCommit");
    expect(b.harness.names()).not.toContain("createBranch");
    expect(await projectRepoRows(b.database, world.organizationId)).toEqual([]);
    expect(await auditCount(world.organizationId, "repo.createSpec")).toBe(0);
  });
});

describe("CA7 nom invalide : VALIDATION avant tout appel réseau", () => {
  it.each(["a/b", "..", ".", "x.git", "a b", "é", "-".repeat(101), "a".repeat(101)])(
    "refuse %j",
    async (name) => {
      const b = bench();
      const { world, installation, api } = await scene(b);
      const res = await api.createSpec(world.projectId, installation.id, { name });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("VALIDATION");
      expect(res.body.data.field).toBe("name");
      expect(b.harness.calls).toEqual([]);
      expect(await projectRepoRows(b.database, world.organizationId)).toEqual([]);
    },
  );
});

describe("CA10 échec partiel : repo orphelin, aucune ligne, aucun audit", () => {
  it.each(["writeCommit", "createBranch"])(
    "%s en échec après createRepo : 503, rien en base, le repo existe chez le fournisseur",
    async (step) => {
      const b = bench();
      const { world, installation, response } = await partial(step);
      expect(response.status).toBe(503);
      expect(response.body.code).toBe("PROVIDER_UNAVAILABLE");
      expect(await projectRepoRows(b.database, world.organizationId)).toEqual([]);
      expect(await auditCount(world.organizationId, "repo.createSpec")).toBe(0);
      expect((await b.harness.inspect(orphan(installation.ownerLogin))).repo.id).toEqual(
        expect.any(String),
      );
    },
  );

  it("un nouvel essai au nom par défaut donne repo_name_taken, avec un autre nom il réussit", async () => {
    const b = bench();
    const { world, installation, api } = await partial("writeCommit");
    const retry = await api.createSpec(world.projectId, installation.id);
    expect(retry.status).toBe(409);
    expect(retry.body.data).toEqual({ reason: "repo_name_taken" });

    const other = await api.createSpec(world.projectId, installation.id, { name: "autre-spec" });

    expect(other.status, JSON.stringify(other.body)).toBe(200);
    expect(await projectRepoRows(b.database, world.organizationId)).toHaveLength(1);
    expect(await auditCount(world.organizationId, "repo.createSpec")).toBe(1);
  });
});

async function partial(step: string) {
  const b = bench();
  const s = await scene(b);
  b.harness.failWith(step, new GitProviderUnavailableError({ operation: step }), { once: true });
  const response = await s.api.createSpec(s.world.projectId, s.installation.id);
  return { ...s, response };
}

const orphan = (login: string) =>
  ({ owner: { kind: "organization", login }, name: DEFAULT_REPO_NAME }) as const;

describe("atomicité : l'audit qui échoue annule l'insertion de project_repos", () => {
  it("repo.createSpec : 500 INTERNAL, aucune ligne ; le repo orphelin donne repo_name_taken ensuite", async () => {
    const b = bench();
    const { world, installation, api } = await scene(b);
    await b.database.query("INSERT INTO audit_fail VALUES ('repo.createSpec')");

    const res = await api.createSpec(world.projectId, installation.id);

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("INTERNAL");
    expect(await projectRepoRows(b.database, world.organizationId)).toEqual([]);

    await b.database.query("DELETE FROM audit_fail");
    const retry = await api.createSpec(world.projectId, installation.id);
    expect(retry.status).toBe(409);
    expect(retry.body.data).toEqual({ reason: "repo_name_taken" });
  });
});
