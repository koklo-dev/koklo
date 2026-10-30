import { GitConflictError, GitProviderError, type RepoRef } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { createMockGitServer, type MockGitServerOptions } from "./support/mock-git-server.ts";
import { caught, installationAuth, ORG, providerOn } from "./support/mock-github.ts";

/**
 * TK-44a, adaptateur Octokit : ce que la suite de conformité ne voit pas, c'est-à-dire ce qui
 * circule sur le fil. Mêmes contraintes que le reste de l'adaptateur : aucune écriture avec
 * `force`, aucun appel superflu, une liste bornée, jamais de résultat tronqué en silence.
 */
const AUTHOR = { name: "Koklo", email: "koklo-bot@users.noreply.invalid" } as const;
const auth = installationAuth();
const REPO = "acme/spec";
const repo: RepoRef = { owner: ORG, name: "spec" };

async function setup(options: MockGitServerOptions = {}) {
  const server = createMockGitServer(options);
  const provider = providerOn(server);
  await provider.createRepo({ auth, owner: ORG, name: "spec", visibility: "private" });
  await provider.createBranch({ auth, repo, base: "main", name: "cadrage" });
  const commit = (
    files: Parameters<typeof provider.writeCommit>[0]["files"],
    extra: { expectedHeadSha?: string } = {},
  ) =>
    provider.writeCommit({
      auth,
      repo,
      branch: "cadrage",
      files,
      author: AUTHOR,
      message: "spec: lot",
      ...extra,
    });
  return { server, provider, commit };
}

const writesSince = (server: ReturnType<typeof createMockGitServer>, from: number) =>
  server
    .writes()
    .slice(from)
    .map((r) => `${r.method} ${r.path}`);

describe("TK-44a writeCommit : suppression sur le fil", () => {
  it("une suppression est une entrée d'arbre `sha: null` sans contenu, une écriture porte son contenu", async () => {
    const { server, commit } = await setup();
    await commit([
      { path: "features/F-001-a.md", content: "a" },
      { path: "features/F-002-b.md", content: "b" },
    ]);
    const from = server.writes().length;

    await commit([
      { path: "features/F-001-a.md", delete: true },
      { path: "features/F-002-b.md", content: "b2" },
    ]);

    const tree = server
      .writes()
      .slice(from)
      .find((r) => r.path === `/repos/${REPO}/git/trees`);
    const entries =
      (tree?.body as { tree: Array<Record<string, unknown>> } | undefined)?.tree ?? [];
    const removed = entries.find((e) => e.path === "features/F-001-a.md");
    const written = entries.find((e) => e.path === "features/F-002-b.md");
    expect(removed).toMatchObject({ sha: null, type: "blob" });
    expect(removed).not.toHaveProperty("content");
    expect(written).toMatchObject({ content: "b2", mode: "100644", type: "blob" });
    expect(server.unmatched).toEqual([]);
  });

  it("toujours un seul arbre, un seul commit et une mise à jour de référence sans force", async () => {
    const { server, commit } = await setup();
    await commit([{ path: "a.md", content: "a" }]);
    const from = server.writes().length;

    await commit([
      { path: "a.md", delete: true },
      { path: "b.md", content: "b" },
    ]);

    expect(writesSince(server, from)).toEqual([
      `POST /repos/${REPO}/git/trees`,
      `POST /repos/${REPO}/git/commits`,
      `PATCH /repos/${REPO}/git/refs/heads/cadrage`,
    ]);
    const ref = server.writes().at(-1);
    expect((ref?.body as { force?: boolean } | undefined)?.force).not.toBe(true);
  });
});

describe("TK-44a writeCommit : tête périmée sur le fil", () => {
  it("expectedHeadSha périmé : refus avant toute écriture (aucun arbre, commit ni référence)", async () => {
    const { server, commit } = await setup();
    const stale = await commit([{ path: "a.md", content: "a" }]);
    await commit([{ path: "b.md", content: "b" }]);
    const from = server.writes().length;

    const error = await caught(
      commit([{ path: "c.md", content: "c" }], { expectedHeadSha: stale.sha }),
    );

    expect(error).toBeInstanceOf(GitConflictError);
    expect(error).toMatchObject({ operation: "writeCommit", reason: "stale-sha" });
    expect(writesSince(server, from)).toEqual([]);
  });

  it("la tête avance entre la lecture et la mise à jour de la référence : 422 non fast-forward = stale-sha", async () => {
    let raced = false;
    const { server, provider, commit } = await setup({
      beforeRefUpdate: (srv, repoKey, branch) => {
        if (raced) return;
        raced = true;
        srv.advance(repoKey, branch, { "autre.md": "o" });
      },
    });
    const head = await provider.readFile({ auth, repo, ref: "cadrage", path: "README.md" });

    const error = await caught(
      commit([{ path: "c.md", content: "c" }], { expectedHeadSha: head.ref }),
    );

    expect(error).toBeInstanceOf(GitConflictError);
    expect(error).toMatchObject({ operation: "writeCommit", reason: "stale-sha" });
    const after = await provider.listFiles({ auth, repo, ref: "cadrage" });
    expect(after.files.map((f) => f.path)).toEqual(["README.md", "autre.md"]);
    expect(server.head(REPO, "cadrage")).toBe(after.ref);
  });

  it("même course sans expectedHeadSha : stale-sha aussi (la référence n'est jamais écrasée)", async () => {
    let raced = false;
    const { commit } = await setup({
      beforeRefUpdate: (srv, repoKey, branch) => {
        if (raced) return;
        raced = true;
        srv.advance(repoKey, branch, { "autre.md": "o" });
      },
    });

    const error = await caught(commit([{ path: "c.md", content: "c" }]));

    expect(error).toMatchObject({ reason: "stale-sha" });
  });
});

describe("TK-44a listFiles sur le fil", () => {
  it("lit l'arbre en une fois (récursif) sans lire chaque fichier", async () => {
    const { server, provider, commit } = await setup();
    await commit([
      { path: "features/F-001-a.md", content: "a" },
      { path: "design/screens/S-a.json", content: "{}" },
    ]);
    server.requests.length = 0;

    const listing = await provider.listFiles({ auth, repo, ref: "cadrage" });

    expect(listing.files).toHaveLength(3);
    const trees = server.requests.filter(
      (r) => r.method === "GET" && r.path.includes("/git/trees/"),
    );
    expect(trees).toHaveLength(1);
    expect(["1", "true"]).toContain(trees[0]?.query.get("recursive"));
    expect(server.requests.filter((r) => r.path.includes("/contents/"))).toEqual([]);
    expect(server.requests.every((r) => r.method === "GET")).toBe(true);
    expect(server.unmatched).toEqual([]);
  });

  it("arbre tronqué par GitHub : GitProviderError (listFiles), jamais une liste partielle", async () => {
    const { provider } = await setup({ truncatedTrees: true });

    const error = await caught(provider.listFiles({ auth, repo, ref: "cadrage" }));

    expect(error).toBeInstanceOf(GitProviderError);
    expect(error.constructor).toBe(GitProviderError);
    expect(error).toMatchObject({ operation: "listFiles" });
  });
});

describe("TK-44a listCommits sur le fil : pagination bornée", () => {
  it("plus de 50 commits côté serveur (Link rel=next) : une seule requête, 50 résultats", async () => {
    const { server, provider } = await setup();
    for (let i = 0; i < 60; i++) server.advance(REPO, "cadrage", { "n.md": String(i) });
    server.requests.length = 0;

    const commits = await provider.listCommits({ auth, repo, ref: "cadrage" });

    expect(commits).toHaveLength(50);
    const listings = server.commitListRequests();
    expect(listings).toHaveLength(1);
    expect(listings[0]?.query.get("sha")).toBe("cadrage");
    expect(Number(listings[0]?.query.get("per_page"))).toBeLessThanOrEqual(50);
    expect(Number(listings[0]?.query.get("page") ?? "1")).toBe(1);
  });

  it("limit: 5 : une requête, au plus 5 par page, 5 résultats", async () => {
    const { server, provider } = await setup();
    for (let i = 0; i < 10; i++) server.advance(REPO, "cadrage", { "n.md": String(i) });
    server.requests.length = 0;

    const commits = await provider.listCommits({ auth, repo, ref: "cadrage", limit: 5 });

    expect(commits).toHaveLength(5);
    expect(server.commitListRequests()).toHaveLength(1);
    expect(Number(server.commitListRequests()[0]?.query.get("per_page"))).toBeLessThanOrEqual(5);
  });

  it("limit: 500 est ramené à 50 avant l'appel réseau", async () => {
    const { server, provider } = await setup();
    server.requests.length = 0;

    await provider.listCommits({ auth, repo, ref: "cadrage", limit: 500 });

    expect(Number(server.commitListRequests()[0]?.query.get("per_page"))).toBeLessThanOrEqual(50);
  });

  it("aucune écriture, aucun appel hors du sous-ensemble connu", async () => {
    const { server, provider } = await setup();
    server.requests.length = 0;

    await provider.listCommits({ auth, repo, ref: "cadrage" });

    expect(server.writes()).toEqual([]);
    expect(server.unmatched).toEqual([]);
  });
});
