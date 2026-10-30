import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  Commit,
  FileChange,
  FileDeletion,
  FileEntry,
  FileListing,
  FileWrite,
  GitAuth,
  GitProvider,
  GitRef,
  RepoRef,
  Sha,
} from "../src/index.ts";
import { FAKE_EXPIRES_AT, FakeGitProvider } from "./git-provider.fake.ts";

/**
 * TK-44a : le port gagne ce qu'il faut à l'écriture de spec par lots (vision §5.2, §8.2).
 *  - `FileChange` sait supprimer un fichier (`feature.delete`) ;
 *  - `writeCommit` accepte la tête attendue (`expectedHeadSha`) et signale une tête périmée par
 *    `GitConflictError` `stale-sha` ;
 *  - `listFiles` liste les fichiers d'un ref (valider la spec entière) ;
 *  - `listCommits` liste les commits récents d'un ref (retrouver `Koklo-Ops` après un crash).
 * Le domaine ne compile pas les tests avec vitest : les assertions de type sont doublées de
 * lectures du source pour que l'étape Red échoue réellement.
 */
const src = (file: string) => readFileSync(resolve(import.meta.dirname, "../src", file), "utf8");

const auth: GitAuth = { kind: "installation", token: "iat", expiresAt: FAKE_EXPIRES_AT };
const repo: RepoRef = { owner: { kind: "organization", login: "acme" }, name: "spec" };
const provider: GitProvider = new FakeGitProvider();

describe("TK-44a FileChange : écriture ou suppression", () => {
  it("FileChange est l'union FileWrite | FileDeletion", () => {
    expectTypeOf<FileChange>().toEqualTypeOf<FileWrite | FileDeletion>();
    expectTypeOf<FileDeletion>().toEqualTypeOf<{
      readonly path: string;
      readonly delete: true;
    }>();
    const source = src("git-repo.ts");
    expect(source).toMatch(/export type FileDeletion = \{/);
    expect(source).toMatch(/readonly delete: true;/);
    expect(source).toMatch(/export type FileChange = FileWrite \| FileDeletion;/);
  });

  it("une écriture existante reste un FileChange valide (compatibilité des appelants)", () => {
    const write: FileChange = { path: "a.md", content: "a", mode: "100755" };
    const bare: FileChange = { path: "b.md", content: "b" };
    const deletion: FileChange = { path: "c.md", delete: true };
    expect([write.path, bare.path, deletion.path]).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("une suppression ne porte ni contenu ni mode", () => {
    // @ts-expect-error une suppression n'a pas de contenu
    const withContent: FileDeletion = { path: "c.md", delete: true, content: "x" };
    // @ts-expect-error `delete: false` n'est pas une suppression
    const notDeletion: FileDeletion = { path: "c.md", delete: false };
    expect([withContent, notDeletion]).toHaveLength(2);
  });
});

describe("TK-44a writeCommit : tête attendue", () => {
  it("accepte expectedHeadSha facultatif de type Sha", () => {
    type Request = Parameters<GitProvider["writeCommit"]>[0];
    expectTypeOf<Request["expectedHeadSha"]>().toEqualTypeOf<Sha | undefined>();
    expect(src("git-provider.ts")).toMatch(
      /readonly expectedHeadSha\?: Sha;|expectedHeadSha\?: Sha;/,
    );
  });

  it("documente GitConflictError stale-sha pour une tête périmée", () => {
    expect(src("git-provider.ts")).toMatch(
      /@throws GitConflictError `stale-sha`[\s\S]*?\*\/\s*writeCommit\(/,
    );
  });

  it("une suppression passe par writeCommit sans autre changement de signature", async () => {
    const commit = await provider.writeCommit({
      auth,
      repo,
      branch: "cadrage",
      files: [
        { path: "features/F-001-a.md", delete: true },
        { path: "features/F-002-b.md", content: "b" },
      ],
      expectedHeadSha: "sha-head",
      author: { name: "Koklo", email: "koklo-bot@users.noreply.invalid" },
      message: "spec: modifié F-002, supprimé F-001",
    });
    expectTypeOf(commit).toEqualTypeOf<Commit>();
  });
});

describe("TK-44a listFiles", () => {
  it("listFiles({ auth, repo, ref }) -> Promise<FileListing>", () => {
    expectTypeOf<Parameters<GitProvider["listFiles"]>[0]>().toEqualTypeOf<{
      auth: GitAuth;
      repo: RepoRef;
      ref: GitRef;
    }>();
    expectTypeOf<ReturnType<GitProvider["listFiles"]>>().toEqualTypeOf<Promise<FileListing>>();
    expect(src("git-provider.ts")).toMatch(/listFiles\(request: \{/);
  });

  it("FileListing = { ref: Sha (commit résolu), files: FileEntry[] } ; FileEntry = { path, sha }", () => {
    expectTypeOf<FileListing>().toEqualTypeOf<{
      readonly ref: Sha;
      readonly files: readonly FileEntry[];
    }>();
    expectTypeOf<FileEntry>().toEqualTypeOf<{ readonly path: string; readonly sha: Sha }>();
    const source = src("git-repo.ts");
    expect(source).toMatch(/export type FileEntry = \{/);
    expect(source).toMatch(/export type FileListing = \{/);
  });

  it("documente GitNotFoundError pour un ref introuvable et la liste récursive des fichiers", () => {
    expect(src("git-provider.ts")).toMatch(/@throws GitNotFoundError\s*\*\/\s*listFiles\(/);
  });
});

describe("TK-44a listCommits", () => {
  it("listCommits({ auth, repo, ref, limit? }) -> Promise<readonly Commit[]>", () => {
    expectTypeOf<Parameters<GitProvider["listCommits"]>[0]>().toEqualTypeOf<{
      auth: GitAuth;
      repo: RepoRef;
      ref: GitRef;
      limit?: number;
    }>();
    expectTypeOf<ReturnType<GitProvider["listCommits"]>>().toEqualTypeOf<
      Promise<readonly Commit[]>
    >();
    expect(src("git-provider.ts")).toMatch(/listCommits\(request: \{/);
  });

  it("documente le plafond de 50, l'ordre du plus récent au plus ancien et GitNotFoundError", () => {
    const source = src("git-provider.ts");
    expect(source).toMatch(/plafonn\S* à 50|50 commits|limit[^\n]*50|50[^\n]*limit/i);
    expect(source).toMatch(/@throws GitNotFoundError\s*\*\/\s*listCommits\(/);
  });
});
