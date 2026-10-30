import { GitNotFoundError, GitProviderUnavailableError, GitRateLimitedError } from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditRowsFull } from "./helpers/comments.ts";
import { installBench, scene } from "./helpers/repo-scene.ts";
import { insertProjectRepo, projectRepoRows } from "./helpers/repos.ts";
import { insertProject } from "./helpers/tickets.ts";

/** TK-43 CA12 : repo.link (repli de l'ADR 0009, option C) et repo.list. */
const bench = installBench({ beforeAll, afterAll, beforeEach });

async function linkable(name = "demo") {
  const b = bench();
  const s = await scene(b);
  const provider = await b.harness.seedRepo(s.owner, name);
  b.harness.calls = [];
  const link = (over: Record<string, unknown> = {}, projectId = s.world.projectId) =>
    s.api.link(projectId, s.installation.id, { ownerLogin: s.owner.login, name, ...over });
  return { b, ...s, provider, link };
}

describe("repo.link : lie un dépôt existant", () => {
  it("persiste les valeurs du FOURNISSEUR (id externe, branche), mode adopted, rôle demandé", async () => {
    const { b, world, installation, provider, link } = await linkable();
    const res = await link({ role: "front" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const [row] = await projectRepoRows(b.database, world.organizationId);
    expect(row).toMatchObject({
      project_id: world.projectId,
      installation_id: installation.id,
      role: "front",
      mode: "adopted",
      external_id: provider.id,
      owner_login: installation.ownerLogin,
      name: "demo",
      default_branch: provider.defaultBranch,
      spec_path: null,
    });
    expect(res.body).toEqual({
      id: row?.id,
      projectId: world.projectId,
      installationId: installation.id,
      role: "front",
      mode: "adopted",
      ownerLogin: installation.ownerLogin,
      name: "demo",
      defaultBranch: provider.defaultBranch,
      specPath: null,
    });
  });
});

describe("repo.link : appels fournisseur et audit", () => {
  it("lit le dépôt avec un jeton d'installation et n'écrit rien chez le fournisseur", async () => {
    const { b, owner, link } = await linkable();
    await link();
    expect(b.harness.names().filter((name) => name !== "authenticate")).toEqual(["getRepo"]);
    const [read] = b.harness.callsOf("getRepo");
    expect(read?.request).toMatchObject({
      repo: { owner, name: "demo" },
      auth: { kind: "installation" },
    });
    expect(b.harness.callsOf("authenticate")[0]?.request.user).toBeUndefined();
    for (const call of b.harness.calls) expect(call.openTransactions).toBe(0);
  });

  it("journalise repo.link / repo / id de la ligne dans la même transaction", async () => {
    const { b, world, link } = await linkable();
    await link();
    const [row] = await projectRepoRows(b.database, world.organizationId);
    const audit = (await auditRowsFull(b.database, world.organizationId)).filter(
      (entry) => entry.action === "repo.link",
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      target_kind: "repo",
      target_id: row?.id,
      actor_kind: "human",
      actor_id: world.actors.owner.userId,
    });
  });

  it("un dépôt de spec adopté (role spec) ne reçoit ni structure ni branche", async () => {
    const { b, link } = await linkable();
    const res = await link({ role: "spec" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: "spec", mode: "adopted", specPath: null });
    expect(b.harness.names()).not.toContain("writeCommit");
    expect(b.harness.names()).not.toContain("createBranch");
    expect(b.harness.names()).not.toContain("createRepo");
  });

  it("un monorepo peut porter la spec dans un dossier (specPath)", async () => {
    const { b, world, link } = await linkable();
    const res = await link({ role: "monorepo", specPath: "docs/spec" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.specPath).toBe("docs/spec");
    expect((await projectRepoRows(b.database, world.organizationId))[0]?.spec_path).toBe(
      "docs/spec",
    );
  });
});

describe("repo.link : refus", () => {
  it("dépôt introuvable : 404 NOT_FOUND, ni ligne ni audit", async () => {
    const { b, world, link } = await linkable();
    const res = await link({ name: "absent" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(await projectRepoRows(b.database, world.organizationId)).toEqual([]);
    const audit = await auditRowsFull(b.database, world.organizationId);
    expect(audit.filter((entry) => entry.action === "repo.link")).toEqual([]);
  });

  it("propriétaire différent de celui de l'installation : 404 NOT_FOUND (hors installation)", async () => {
    const { b, world, link } = await linkable();
    const res = await link({ ownerLogin: "quelquun-d-autre" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(await projectRepoRows(b.database, world.organizationId)).toEqual([]);
  });

  it("déjà lié : CONFLICT repo_already_linked (même projet, puis un autre projet de l'organisation)", async () => {
    const { b, world, link } = await linkable();
    expect((await link({ role: "front" })).status).toBe(200);
    const same = await link({ role: "back" });
    expect(same.status).toBe(409);
    expect(same.body.data).toEqual({ reason: "repo_already_linked" });
    const second = await insertProject(b.database, world.organizationId, "Second");
    const other = await link({ role: "back" }, second);
    expect(other.status).toBe(409);
    expect(other.body.data).toEqual({ reason: "repo_already_linked" });
    expect(await projectRepoRows(b.database, world.organizationId)).toHaveLength(1);
  });

  it("un repo créé par repo.createSpec ne peut plus être lié : repo_already_linked", async () => {
    const { b, world, installation, owner, api } = await linkable();
    expect((await api.createSpec(world.projectId, installation.id)).status).toBe(200);
    const res = await api.link(world.projectId, installation.id, {
      role: "front",
      ownerLogin: owner.login,
      name: "projet-spec",
    });
    expect(res.status).toBe(409);
    expect(res.body.data).toEqual({ reason: "repo_already_linked" });
    expect(b.harness.callsOf("getRepo").length).toBeGreaterThanOrEqual(1);
  });

  it("second porteur de spec : CONFLICT spec_repo_exists (role spec ou specPath), avant tout réseau", async () => {
    const { b, world, installation, link } = await linkable();
    await insertProjectRepo(b.database, world.organizationId, world.projectId, installation.id, {
      role: "spec",
    });
    for (const over of [{ role: "spec" }, { role: "monorepo", specPath: "spec" }]) {
      const res = await link(over);
      expect(res.status).toBe(409);
      expect(res.body.data).toEqual({ reason: "spec_repo_exists" });
    }
    expect(b.harness.calls).toEqual([]);
  });
});

describe("repo.link : VALIDATION avant tout réseau", () => {
  it("role spec avec specPath : field specPath", async () => {
    const { b, link } = await linkable();
    const res = await link({ role: "spec", specPath: "docs" });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(res.body.data.field).toBe("specPath");
    expect(b.harness.calls).toEqual([]);
  });

  it.each(["/abs", "../x", "a/../b", "a/.."])("specPath %j refusé", async (specPath) => {
    const { b, link } = await linkable();
    const res = await link({ role: "monorepo", specPath });
    expect(res.status).toBe(422);
    expect(res.body.data.field).toBe("specPath");
    expect(b.harness.calls).toEqual([]);
  });
});

describe("repo.link : erreurs du fournisseur", () => {
  const CASES = [
    {
      label: "GitNotFoundError",
      error: () =>
        new GitNotFoundError({ operation: "getRepo", resource: "repository", identifier: "x" }),
      status: 404,
      code: "NOT_FOUND",
    },
    {
      label: "GitRateLimitedError",
      error: () => new GitRateLimitedError({ operation: "getRepo", retryAfterMs: 5000 }),
      status: 429,
      code: "PROVIDER_RATE_LIMITED",
    },
    {
      label: "GitProviderUnavailableError",
      error: () => new GitProviderUnavailableError({ operation: "getRepo" }),
      status: 503,
      code: "PROVIDER_UNAVAILABLE",
    },
    {
      label: "Error inconnue",
      error: () => new Error("MESSAGE-BRUT-DU-FOURNISSEUR"),
      status: 500,
      code: "INTERNAL",
    },
  ];

  it.each(CASES)("$label : $status $code, sans ligne ni message brut", async (c) => {
    const { b, world, link } = await linkable();
    b.harness.failWith("getRepo", c.error());
    const res = await link();
    expect(res.status).toBe(c.status);
    expect(res.body.code).toBe(c.code);
    expect(JSON.stringify(res.body)).not.toContain("MESSAGE-BRUT");
    expect(await projectRepoRows(b.database, world.organizationId)).toEqual([]);
  });
});

describe("atomicité : l'audit qui échoue annule l'insertion (repo.link)", () => {
  it("500 INTERNAL, aucune ligne ; sans l'échec d'audit, le même lien réussit", async () => {
    const { b, world, link } = await linkable();
    await b.database.query("INSERT INTO audit_fail VALUES ('repo.link')");
    const res = await link();
    expect(res.status).toBe(500);
    expect(res.body.code).toBe("INTERNAL");
    expect(await projectRepoRows(b.database, world.organizationId)).toEqual([]);
    await b.database.query("DELETE FROM audit_fail");
    expect((await link()).status).toBe(200);
  });
});
