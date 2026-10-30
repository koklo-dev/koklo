/**
 * Conformité de `Repo.id` et `getRepo` (TK-43, QB1). Fichier séparé de `suite.ts` (déjà au-delà de
 * 300 lignes) ; mêmes principes : un seul corps de tests, exécuté contre le faux en mémoire et
 * contre l'adaptateur Octokit branché sur le transport simulé (CI), puis, à la main, contre
 * GitHub réel (voir NEEDS-HUMAN du ticket).
 */
import {
  type GitAuth,
  GitNotFoundError,
  type GitOwner,
  type GitProvider,
  type Repo,
} from "@koklo/domain";
import { describe, expect, it } from "vitest";

export type GetRepoContext = {
  readonly provider: GitProvider;
  readonly owner: GitOwner;
  /** Jeton d'installation valide pour `owner`. */
  readonly auth: () => Promise<GitAuth>;
  /** Nom de dépôt unique à l'exécution. */
  readonly uniqueName: (prefix: string) => string;
};

export type GetRepoFactory = () => Promise<GetRepoContext>;

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("la promesse s'est résolue alors qu'une erreur typée était attendue");
}

export function runGetRepoConformance(label: string, factory: GetRepoFactory): void {
  describe(`GitProvider getRepo et Repo.id : ${label}`, () => {
    const created = async (prefix = "get-repo"): Promise<{ ctx: GetRepoContext; repo: Repo }> => {
      const ctx = await factory();
      const repo = await ctx.provider.createRepo({
        auth: await ctx.auth(),
        owner: ctx.owner,
        name: ctx.uniqueName(prefix),
        visibility: "private",
      });
      return { ctx, repo };
    };

    it("createRepo rend un id : chaîne non vide, jamais le « propriétaire/nom »", async () => {
      const { repo } = await created();
      expect(typeof repo.id).toBe("string");
      expect(repo.id.length).toBeGreaterThan(0);
      expect(repo.id).not.toContain("/");
      expect(repo.id).not.toBe(repo.ref.name);
    });

    it("deux dépôts ont deux identifiants distincts", async () => {
      const ctx = await factory();
      const auth = await ctx.auth();
      const make = () =>
        ctx.provider.createRepo({
          auth,
          owner: ctx.owner,
          name: ctx.uniqueName("get-repo-distinct"),
          visibility: "private",
        });
      const [first, second] = [await make(), await make()];
      expect(first.id).not.toBe(second.id);
    });

    it("getRepo d'un dépôt existant rend le même dépôt (id, ref, visibilité, branche, URL)", async () => {
      const { ctx, repo } = await created();
      const read = await ctx.provider.getRepo({ auth: await ctx.auth(), repo: repo.ref });
      expect(read).toEqual(repo);
      expect(read.id).toBe(repo.id);
      expect(read.visibility).toBe("private");
      expect(read.defaultBranch).toBe("main");
      expect(read.ref.owner).toEqual(ctx.owner);
    });

    it("getRepo est stable : deux lectures successives rendent le même id", async () => {
      const { ctx, repo } = await created();
      const auth = await ctx.auth();
      const [a, b] = [
        await ctx.provider.getRepo({ auth, repo: repo.ref }),
        await ctx.provider.getRepo({ auth, repo: repo.ref }),
      ];
      expect(a.id).toBe(b.id);
    });

    it("getRepo d'un dépôt inexistant : GitNotFoundError", async () => {
      const ctx = await factory();
      const error = await rejection(
        ctx.provider.getRepo({
          auth: await ctx.auth(),
          repo: { owner: ctx.owner, name: ctx.uniqueName("absent") },
        }),
      );
      expect(error).toBeInstanceOf(GitNotFoundError);
      expect(error).toMatchObject({ operation: "getRepo" });
    });
  });
}
