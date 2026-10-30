/**
 * Conformité des opérations ajoutées au port par TK-44a (écriture de spec par lots) :
 * suppression de fichier dans un commit, `expectedHeadSha` de `writeCommit` (tête périmée =
 * `GitConflictError` `stale-sha`), `listFiles`, `listCommits`. Fichier séparé de `suite.ts`
 * (déjà au-delà de 300 lignes) ; un seul corps de tests, exécuté contre le faux en mémoire et
 * contre l'adaptateur Octokit sur le transport simulé (CI), puis à la main contre GitHub réel
 * (NEEDS-HUMAN, même procédure que TK-39 : `writeCommit` sur tête périmée, `listFiles` récursif
 * et `listCommits` ne sont pas vérifiés contre GitHub réel).
 */
import {
  type Commit,
  type FileChange,
  type GitAuth,
  GitConflictError,
  GitNotFoundError,
  type GitOwner,
  type GitProvider,
  type RepoRef,
} from "@koklo/domain";
import { describe, expect, it } from "vitest";

export type CommitOpsContext = {
  readonly provider: GitProvider;
  readonly owner: GitOwner;
  /** Jeton d'installation valide pour `owner`. */
  readonly auth: () => Promise<GitAuth>;
  /** Nom de dépôt unique à l'exécution. */
  readonly uniqueName: (prefix: string) => string;
};

export type CommitOpsFactory = () => Promise<CommitOpsContext>;

const BOT = { name: "Koklo", email: "koklo-bot@users.noreply.invalid" } as const;
const BRANCH = "cadrage/lot";

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("la promesse s'est résolue alors qu'une erreur typée était attendue");
}

export function runCommitOpsConformance(label: string, factory: CommitOpsFactory): void {
  describe(`GitProvider écriture par lots (TK-44a) : ${label}`, () => {
    /** Dépôt neuf (README.md sur main) et branche de travail `cadrage/lot` issue de main. */
    const fresh = async () => {
      const ctx = await factory();
      const auth = await ctx.auth();
      const created = await ctx.provider.createRepo({
        auth,
        owner: ctx.owner,
        name: ctx.uniqueName("batch"),
        visibility: "private",
      });
      await ctx.provider.createBranch({ auth, repo: created.ref, base: "main", name: BRANCH });
      const commit = (files: readonly FileChange[], message = "spec: lot", extra = {}) =>
        ctx.provider.writeCommit({
          auth,
          repo: created.ref,
          branch: BRANCH,
          files,
          author: BOT,
          message,
          ...extra,
        });
      const read = (path: string, ref = BRANCH) =>
        ctx.provider.readFile({ auth, repo: created.ref, ref, path });
      const list = (ref = BRANCH) => ctx.provider.listFiles({ auth, repo: created.ref, ref });
      const commits = (ref = BRANCH, limit?: number) =>
        ctx.provider.listCommits({
          auth,
          repo: created.ref,
          ref,
          ...(limit === undefined ? {} : { limit }),
        });
      return { ctx, auth, repo: created.ref as RepoRef, commit, read, list, commits };
    };

    describe("writeCommit : suppression de fichier", () => {
      it("un commit écrit, remplace et supprime plusieurs fichiers d'un coup", async () => {
        const s = await fresh();
        const first = await s.commit([
          { path: "features/F-001-a.md", content: "a" },
          { path: "features/F-002-b.md", content: "b" },
          { path: "koklo.project.yaml", content: "p" },
        ]);

        const second = await s.commit(
          [
            { path: "features/F-001-a.md", content: "a2" },
            { path: "features/F-002-b.md", delete: true },
            { path: "features/F-003-c.md", content: "c" },
          ],
          "spec: modifié F-001, supprimé F-002, créé F-003",
        );

        expect(second.parents).toEqual([first.sha]);
        expect(second.message).toBe("spec: modifié F-001, supprimé F-002, créé F-003");
        expect(second.author).toEqual(BOT);
        expect((await s.read("features/F-001-a.md")).content).toBe("a2");
        expect((await s.read("features/F-003-c.md")).content).toBe("c");
        expect(await rejection(s.read("features/F-002-b.md"))).toBeInstanceOf(GitNotFoundError);
        expect((await s.read("koklo.project.yaml")).content).toBe("p");
        expect((await s.read("README.md")).content).toContain("batch");
      });

      it("la tête de la branche est le commit rendu, un seul commit est ajouté", async () => {
        const s = await fresh();
        const before = await s.commits();
        const commit = await s.commit([{ path: "a.md", content: "a" }]);
        const after = await s.commits();

        expect(after.map((c) => c.sha)).toEqual([commit.sha, ...before.map((c) => c.sha)]);
        expect((await s.list()).ref).toBe(commit.sha);
      });

      it("un commit composé uniquement de suppressions est valide", async () => {
        const s = await fresh();
        await s.commit([
          { path: "a.md", content: "a" },
          { path: "dir/b.md", content: "b" },
        ]);

        const removal = await s.commit([
          { path: "a.md", delete: true },
          { path: "dir/b.md", delete: true },
        ]);

        expect((await s.list()).files.map((f) => f.path)).toEqual(["README.md"]);
        expect((await s.list()).ref).toBe(removal.sha);
        expect(await rejection(s.read("dir/b.md"))).toBeInstanceOf(GitNotFoundError);
      });

      it("la suppression ne touche pas la branche d'origine", async () => {
        const s = await fresh();
        await s.commit([{ path: "a.md", content: "a" }]);
        await s.commit([{ path: "a.md", delete: true }]);

        expect((await s.list("main")).files.map((f) => f.path)).toEqual(["README.md"]);
      });
    });

    describe("writeCommit : tête attendue et tête périmée", () => {
      it("expectedHeadSha égal à la tête : le commit est posé", async () => {
        const s = await fresh();
        const head = await s.commit([{ path: "a.md", content: "a" }]);

        const next = await s.commit([{ path: "a.md", content: "a2" }], "spec: a2", {
          expectedHeadSha: head.sha,
        });

        expect(next.parents).toEqual([head.sha]);
        expect((await s.read("a.md")).content).toBe("a2");
      });

      it("expectedHeadSha périmé : GitConflictError stale-sha, la branche n'a pas bougé", async () => {
        const s = await fresh();
        const stale = await s.commit([{ path: "a.md", content: "a" }]);
        const head = await s.commit([{ path: "b.md", content: "b" }]);

        const error = await rejection(
          s.commit([{ path: "c.md", content: "c" }], "spec: c", { expectedHeadSha: stale.sha }),
        );

        expect(error).toBeInstanceOf(GitConflictError);
        expect(error).toMatchObject({ operation: "writeCommit", reason: "stale-sha" });
        expect((await s.list()).ref).toBe(head.sha);
        expect(await rejection(s.read("c.md"))).toBeInstanceOf(GitNotFoundError);
      });

      it("expectedHeadSha qui n'est le SHA d'aucun commit : stale-sha, rien n'est écrit", async () => {
        const s = await fresh();
        const head = await s.commit([{ path: "a.md", content: "a" }]);

        const error = await rejection(
          s.commit([{ path: "b.md", content: "b" }], "spec: b", {
            expectedHeadSha: "0000000000000000000000000000000000000000",
          }),
        );

        expect(error).toMatchObject({ reason: "stale-sha" });
        expect((await s.list()).ref).toBe(head.sha);
      });

      it("expectedHeadSha périmé avec une suppression : rien n'est supprimé", async () => {
        const s = await fresh();
        const stale = await s.commit([{ path: "a.md", content: "a" }]);
        await s.commit([{ path: "b.md", content: "b" }]);

        const error = await rejection(
          s.commit([{ path: "a.md", delete: true }], "spec: supprime a", {
            expectedHeadSha: stale.sha,
          }),
        );

        expect(error).toBeInstanceOf(GitConflictError);
        expect((await s.read("a.md")).content).toBe("a");
      });

      it("sans expectedHeadSha, le commit s'applique sur la tête courante (comportement historique)", async () => {
        const s = await fresh();
        const first = await s.commit([{ path: "a.md", content: "a" }]);
        const second = await s.commit([{ path: "b.md", content: "b" }]);

        expect(second.parents).toEqual([first.sha]);
      });

      it("deux écritures simultanées visant la même tête : une seule gagne, l'autre est stale-sha", async () => {
        const s = await fresh();
        const head = await s.commit([{ path: "a.md", content: "a" }]);
        const before = await s.commits();

        const settled = await Promise.allSettled([
          s.commit([{ path: "x.md", content: "x" }], "spec: x", { expectedHeadSha: head.sha }),
          s.commit([{ path: "y.md", content: "y" }], "spec: y", { expectedHeadSha: head.sha }),
        ]);

        const won = settled.filter((r) => r.status === "fulfilled");
        const lost = settled.filter((r) => r.status === "rejected");
        expect(won).toHaveLength(1);
        expect(lost).toHaveLength(1);
        expect((lost[0] as PromiseRejectedResult).reason).toBeInstanceOf(GitConflictError);
        expect((lost[0] as PromiseRejectedResult).reason).toMatchObject({ reason: "stale-sha" });
        const after = await s.commits();
        expect(after).toHaveLength(before.length + 1);
        expect(after[0]?.parents).toEqual([head.sha]);
      });
    });

    describe("listFiles", () => {
      it("liste récursivement les fichiers d'une branche, triés par chemin, sans dossiers", async () => {
        const s = await fresh();
        await s.commit([
          { path: "features/F-002-b.md", content: "b" },
          { path: "design/screens/S-home.json", content: "{}" },
          { path: "features/F-001-a.md", content: "a" },
          { path: "koklo.project.yaml", content: "p" },
        ]);

        const listing = await s.list();

        expect(listing.files.map((f) => f.path)).toEqual([
          "README.md",
          "design/screens/S-home.json",
          "features/F-001-a.md",
          "features/F-002-b.md",
          "koklo.project.yaml",
        ]);
      });

      it("ref est le SHA du commit résolu, sha celui du fichier (le même que readFile)", async () => {
        const s = await fresh();
        const commit = await s.commit([{ path: "features/F-001-a.md", content: "a" }]);

        const listing = await s.list();
        const file = listing.files.find((f) => f.path === "features/F-001-a.md");

        expect(listing.ref).toBe(commit.sha);
        expect(file?.sha).toBe((await s.read("features/F-001-a.md")).sha);
        expect(listing.files.every((f) => f.sha.length > 0)).toBe(true);
      });

      it("accepte un SHA de commit : rend l'état de ce commit, avant les suppressions suivantes", async () => {
        const s = await fresh();
        const first = await s.commit([
          { path: "a.md", content: "a" },
          { path: "b.md", content: "b" },
        ]);
        await s.commit([{ path: "a.md", delete: true }]);

        const past = await s.list(first.sha);
        const now = await s.list();

        expect(past.ref).toBe(first.sha);
        expect(past.files.map((f) => f.path)).toEqual(["README.md", "a.md", "b.md"]);
        expect(now.files.map((f) => f.path)).toEqual(["README.md", "b.md"]);
      });

      it("un fichier modifié change de sha, un fichier intact garde le sien", async () => {
        const s = await fresh();
        await s.commit([
          { path: "a.md", content: "a" },
          { path: "b.md", content: "b" },
        ]);
        const before = new Map((await s.list()).files.map((f) => [f.path, f.sha]));
        await s.commit([{ path: "a.md", content: "a2" }]);
        const after = new Map((await s.list()).files.map((f) => [f.path, f.sha]));

        expect(after.get("a.md")).not.toBe(before.get("a.md"));
        expect(after.get("b.md")).toBe(before.get("b.md"));
      });

      it("ref inconnu : GitNotFoundError (listFiles)", async () => {
        const s = await fresh();
        const error = await rejection(s.list("branche-absente"));
        expect(error).toBeInstanceOf(GitNotFoundError);
        expect(error).toMatchObject({ operation: "listFiles" });
      });

      it("dépôt inconnu : GitNotFoundError (listFiles)", async () => {
        const s = await fresh();
        const error = await rejection(
          s.ctx.provider.listFiles({
            auth: s.auth,
            repo: { owner: s.ctx.owner, name: s.ctx.uniqueName("absent") },
            ref: "main",
          }),
        );
        expect(error).toBeInstanceOf(GitNotFoundError);
        expect(error).toMatchObject({ operation: "listFiles" });
      });
    });

    describe("listCommits", () => {
      it("rend les commits du plus récent au plus ancien, chaînés par leurs parents", async () => {
        const s = await fresh();
        const initial = (await s.commits("main"))[0] as Commit;
        const c1 = await s.commit([{ path: "a.md", content: "1" }], "spec: un");
        const c2 = await s.commit([{ path: "a.md", content: "2" }], "spec: deux");
        const c3 = await s.commit([{ path: "a.md", content: "3" }], "spec: trois");

        const commits = await s.commits();

        expect(commits.map((c) => c.sha)).toEqual([c3.sha, c2.sha, c1.sha, initial.sha]);
        expect(commits.map((c) => c.message.trimEnd())).toEqual([
          "spec: trois",
          "spec: deux",
          "spec: un",
          "Initial commit",
        ]);
        expect(commits[0]?.parents).toEqual([c2.sha]);
        expect(commits[1]?.parents).toEqual([c1.sha]);
        expect(commits[2]?.parents).toEqual([initial.sha]);
        expect(commits[3]?.parents).toEqual([]);
        expect(commits[0]?.author).toEqual(BOT);
      });

      it("conserve le message entier : les trailers Koklo-Ops et Co-authored-by restent lisibles", async () => {
        const s = await fresh();
        const batchId = "0198f3a2-7c1e-7d3b-9a55-2f6b8c1d4e90";
        const message = [
          "spec: créé F-004, modifié F-002",
          "",
          `Koklo-Ops: ${batchId}`,
          "Co-authored-by: Ada Lovelace <ada@example.org>",
        ].join("\n");
        await s.commit([{ path: "a.md", content: "1" }], "spec: autre");
        const written = await s.commit([{ path: "b.md", content: "2" }], message);
        await s.commit([{ path: "c.md", content: "3" }], "spec: encore");

        const found = (await s.commits()).find((c) => /^Koklo-Ops: (\S+)$/m.test(c.message));

        expect(found?.sha).toBe(written.sha);
        expect(found?.message.trimEnd()).toBe(message);
        expect(/^Koklo-Ops: (\S+)$/m.exec(found?.message ?? "")?.[1]).toBe(batchId);
        expect(found?.message).toContain("Co-authored-by: Ada Lovelace <ada@example.org>");
      });

      it("limite par défaut de 50 commits, les plus récents", async () => {
        const s = await fresh();
        const written: Commit[] = [];
        for (let i = 1; i <= 55; i++) {
          written.push(await s.commit([{ path: "n.md", content: String(i) }], `spec: ${i}`));
        }

        const commits = await s.commits();

        expect(commits).toHaveLength(50);
        expect(commits[0]?.sha).toBe(written[54]?.sha);
        expect(commits[49]?.sha).toBe(written[5]?.sha);
      });

      it("limit explicite : les N plus récents ; au-delà de 50, plafonné à 50", async () => {
        const s = await fresh();
        const written: Commit[] = [];
        for (let i = 1; i <= 52; i++) {
          written.push(await s.commit([{ path: "n.md", content: String(i) }], `spec: ${i}`));
        }

        const five = await s.commits(BRANCH, 5);
        const one = await s.commits(BRANCH, 1);
        const huge = await s.commits(BRANCH, 500);

        expect(five.map((c) => c.sha)).toEqual(
          written
            .slice(-5)
            .reverse()
            .map((c) => c.sha),
        );
        expect(one.map((c) => c.sha)).toEqual([written[51]?.sha]);
        expect(huge).toHaveLength(50);
      });

      it("accepte un SHA : l'historique remonte depuis ce commit", async () => {
        const s = await fresh();
        const c1 = await s.commit([{ path: "a.md", content: "1" }], "spec: un");
        await s.commit([{ path: "a.md", content: "2" }], "spec: deux");

        const fromFirst = await s.commits(c1.sha);

        expect(fromFirst[0]?.sha).toBe(c1.sha);
        expect(fromFirst).toHaveLength(2);
      });

      it("une branche courte rend tout son historique, sans dépasser", async () => {
        const s = await fresh();

        expect(await s.commits("main")).toHaveLength(1);
      });

      it("ref inconnu : GitNotFoundError (listCommits)", async () => {
        const s = await fresh();
        const error = await rejection(s.commits("branche-absente"));
        expect(error).toBeInstanceOf(GitNotFoundError);
        expect(error).toMatchObject({ operation: "listCommits" });
      });

      it("dépôt inconnu : GitNotFoundError (listCommits)", async () => {
        const s = await fresh();
        const error = await rejection(
          s.ctx.provider.listCommits({
            auth: s.auth,
            repo: { owner: s.ctx.owner, name: s.ctx.uniqueName("absent") },
            ref: "main",
          }),
        );
        expect(error).toBeInstanceOf(GitNotFoundError);
        expect(error).toMatchObject({ operation: "listCommits" });
      });
    });
  });
}
