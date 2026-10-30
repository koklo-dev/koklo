import { describe, expect, it } from "vitest";
import {
  createMockGitHub,
  installationAuth,
  providerOn,
  type RecordedRequest,
  repoRef,
} from "./support/mock-github.ts";

describe("writeCommit : un seul commit atomique via l'API Git Data", () => {
  it("N fichiers = 1 arbre, 1 commit, 1 mise à jour de référence sans force", async () => {
    const mock = createMockGitHub({
      "GET /repos/acme/demo/git/ref/heads/main": { body: { object: { sha: "h1" } } },
      "GET /repos/acme/demo/git/commits/h1": { body: { sha: "h1", tree: { sha: "t0" } } },
      "POST /repos/acme/demo/git/trees": { status: 201, body: { sha: "t1" } },
      "POST /repos/acme/demo/git/commits": {
        status: 201,
        body: {
          sha: "c1",
          message: "feat: deux fichiers",
          author: { name: "Koklo", email: "bot@koklo.test" },
          parents: [{ sha: "h1" }],
        },
      },
      "PATCH /repos/acme/demo/git/refs/heads/main": { body: { object: { sha: "c1" } } },
    });
    const commit = await providerOn(mock).writeCommit({
      auth: installationAuth(),
      repo: repoRef,
      branch: "main",
      files: [
        { path: "a.txt", content: "a" },
        { path: "bin/run.sh", content: "#!/bin/sh", mode: "100755" },
      ],
      author: { name: "Koklo", email: "bot@koklo.test" },
      message: "feat: deux fichiers",
    });
    expect(commit).toMatchObject({ sha: "c1", parents: ["h1"], message: "feat: deux fichiers" });
    expect(mock.unmatched).toEqual([]);
    expect(mock.writes().map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /repos/acme/demo/git/trees",
      "POST /repos/acme/demo/git/commits",
      "PATCH /repos/acme/demo/git/refs/heads/main",
    ]);
    const [trees, commits, ref] = mock.writes() as [
      RecordedRequest,
      RecordedRequest,
      RecordedRequest,
    ];
    expect((trees.body as { tree: unknown[] }).tree).toHaveLength(2);
    expect(trees.body).toMatchObject({ base_tree: "t0" });
    expect(commits.body).toMatchObject({
      tree: "t1",
      parents: ["h1"],
      author: { email: "bot@koklo.test" },
    });
    expect((ref.body as { force?: boolean }).force).not.toBe(true);
  });
});
