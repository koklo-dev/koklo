import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditRowsFull, UUID_RE } from "./helpers/comments.ts";
import { installBench, scene } from "./helpers/repo-scene.ts";
import { DEFAULT_REPO_NAME, projectRepoRows } from "./helpers/repos.ts";

/**
 * TK-43, critère du sprint : « test avec le faux fournisseur : repo, structure et branche
 * créés ». Intégration sur base réelle, `InMemoryGitProvider` injecté par le jeton GIT_PROVIDER.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });

async function created(over: Record<string, unknown> = {}) {
  const b = bench();
  const s = await scene(b);
  const res = await s.api.createSpec(s.world.projectId, s.installation.id, over);
  return { ...s, res, ref: { owner: s.owner, name: DEFAULT_REPO_NAME } };
}

describe("CA1 repo.createSpec : repo privé, structure et branche cadrage", () => {
  it("crée le dépôt en trois opérations ordonnées, privé, au nom dérivé du projet", async () => {
    const { res, owner, ref } = await created();
    const { harness } = bench();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(harness.names().filter((name) => name !== "authenticate")).toEqual([
      "createRepo",
      "writeCommit",
      "createBranch",
    ]);
    const [create] = harness.callsOf("createRepo");
    expect(create?.request).toMatchObject({
      owner,
      name: DEFAULT_REPO_NAME,
      visibility: "private",
    });
    expect(create?.request.template).toBeUndefined();
    expect((await harness.inspect(ref)).repo.visibility).toBe("private");
  });

  it("pose la structure sur la branche par défaut en un seul commit signé par le bot", async () => {
    const { ref } = await created();
    const { harness } = bench();
    const [commit] = harness.callsOf("writeCommit");
    expect(commit?.request).toMatchObject({
      repo: ref,
      branch: "main",
      message: "chore: initialise la spec Koklo",
      author: { name: "Koklo" },
    });
    const files = commit?.request.files as { path: string; content: string }[];
    const { read } = await harness.inspect(ref);
    expect(files.map((file) => file.path)).toContain("koklo.project.yaml");
    for (const file of files) {
      expect((await read(file.path, "main")).content, file.path).toBe(file.content);
    }
  });

  it("crée la branche cadrage à partir du commit de la structure", async () => {
    const { ref } = await created();
    const { harness } = bench();
    const written = harness.callsOf("writeCommit")[0]?.result as { sha: string };
    expect(harness.callsOf("createBranch")[0]?.request).toMatchObject({
      repo: ref,
      base: written.sha,
      name: "cadrage",
    });
    const { read } = await harness.inspect(ref);
    expect((await read("koklo.project.yaml", "cadrage")).ref).toBe(written.sha);
    expect((await read("koklo.project.yaml", "main")).ref).toBe(written.sha);
  });
});

describe("CA2 la structure posée est une spec valide", () => {
  it("checkSpec ne rend aucune erreur et le manifeste est reconnu", async () => {
    const { world } = await created();
    const { checkSpec, parseSpecFiles } = await import("@koklo/schema");
    const [commit] = bench().harness.callsOf("writeCommit");
    const files = commit?.request.files as { path: string; content: string }[];
    const report = checkSpec(files);
    expect(report.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
    const [org] = await bench().database.query<{ slug: string }>(
      "SELECT slug FROM organizations WHERE id = $1",
      [world.organizationId],
    );
    const manifest = parseSpecFiles(files).spec.project?.value;
    expect(manifest).toMatchObject({ projet: "projet", organisation: org?.slug, spec_version: 1 });
  });
});

describe("CA1 persistance, réponse et audit", () => {
  it("insère le repo porteur de la spec avec l'identifiant du fournisseur", async () => {
    const { world, installation, ref } = await created();
    const rows = await projectRepoRows(bench().database, world.organizationId);
    const provider = (await bench().harness.inspect(ref)).repo;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      project_id: world.projectId,
      installation_id: installation.id,
      role: "spec",
      mode: "new",
      external_id: provider.id,
      owner_login: installation.ownerLogin,
      name: DEFAULT_REPO_NAME,
      default_branch: "main",
      spec_path: null,
    });
  });

  it("répond avec repoSchema, sans identifiant externe ni URL", async () => {
    const { res, world, installation } = await created();
    const [row] = await projectRepoRows(bench().database, world.organizationId);
    expect(res.body).toEqual({
      id: row?.id,
      projectId: world.projectId,
      installationId: installation.id,
      role: "spec",
      mode: "new",
      ownerLogin: installation.ownerLogin,
      name: DEFAULT_REPO_NAME,
      defaultBranch: "main",
      specPath: null,
    });
    expect(res.body.id).toMatch(UUID_RE);
  });

  it("CA3 journalise repo.createSpec / repo / id de la ligne, par l'utilisateur de la session", async () => {
    const { world } = await created();
    const [row] = await projectRepoRows(bench().database, world.organizationId);
    const audit = await auditRowsFull(bench().database, world.organizationId);
    expect(audit.filter((entry) => entry.action === "repo.createSpec")).toHaveLength(1);
    expect(audit.find((entry) => entry.action === "repo.createSpec")).toMatchObject({
      target_kind: "repo",
      target_id: row?.id,
      ticket_id: null,
      actor_kind: "human",
      actor_id: world.actors.owner.userId,
    });
  });
});

describe("séquence en trois temps : aucun réseau dans une transaction", () => {
  it("chaque appel au fournisseur a lieu sans transaction SQL ouverte, jeton d'installation seul", async () => {
    await created();
    const { harness } = bench();
    expect(harness.calls.length).toBeGreaterThanOrEqual(4);
    for (const call of harness.calls) {
      expect(call.openTransactions, call.method).toBe(0);
    }
    const authenticate = harness.callsOf("authenticate")[0];
    expect(authenticate?.request.user).toBeUndefined();
  });

  it("aucune ligne n'existe tant que le fournisseur n'a pas fini : un échec à createBranch n'en laisse aucune", async () => {
    const b = bench();
    const { world, installation, api } = await scene(b);
    b.harness.failWith("createBranch", new Error("panne"), { once: true });
    const res = await api.createSpec(world.projectId, installation.id);
    expect(res.status).toBe(500);
    expect(await projectRepoRows(b.database, world.organizationId)).toEqual([]);
  });
});

describe("le nom du dépôt", () => {
  it("dérive d'un nom de projet accentué : ASCII minuscule, suffixe -spec", async () => {
    const b = bench();
    const s = await scene(b);
    const { insertProject } = await import("./helpers/tickets.ts");
    const projectId = await insertProject(b.database, s.world.organizationId, "Café Été & Co");
    const res = await s.api.createSpec(projectId, s.installation.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.name).toBe("cafe-ete-co-spec");
  });

  it("accepte un nom fourni valide", async () => {
    const { res } = await created({ name: "Mon_Repo.v2-spec" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Mon_Repo.v2-spec");
  });

  it("ignore toute visibilité ou propriétaire fournis : privé, propriétaire de l'installation", async () => {
    const { res, installation, ref } = await created({
      visibility: "public",
      ownerLogin: "intrus",
    });
    expect(res.status).toBe(200);
    expect(res.body.ownerLogin).toBe(installation.ownerLogin);
    expect((await bench().harness.inspect(ref)).repo.visibility).toBe("private");
  });
});
