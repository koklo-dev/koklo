/**
 * Suite de conformité UNIQUE du port GitProvider (incident 33, annexe C §C.5 de la vision).
 * Un seul corps de tests, deux points d'entrée : `fake.test.ts` (CI, InMemoryGitProvider) et
 * `../real/github.real.ts` (manuel, GitHub réel). Toute divergence découverte en réel devient
 * un cas ici ; le faux se corrige, jamais l'inverse sans preuve.
 */
import {
  type Deployment,
  GitAuthExpiredError,
  GitConflictError,
  GitNotFoundError,
  type GitOwner,
  type GitProvider,
  type RepoRef,
  UserTokenRequiredError,
  WEBHOOK_EVENTS,
} from "@koklo/domain";
import { describe, expect, it } from "vitest";

/** Ce que l'exécution sait faire ; une capacité absente fait sauter le cas, avec sa raison affichée. */
export type ConformanceCapabilities = {
  /** Un déploiement peut être créé (le faux : seedDeployment ; en réel : workflow de déploiement). */
  readonly deployments: boolean;
  /** `mergeable` est calculé de façon synchrone (faux) ; GitHub le rend `null` un moment. */
  readonly mergeableComputed: boolean;
  /** `createRepo` depuis un modèle est possible (le dépôt modèle doit être marqué comme tel chez GitHub). */
  readonly templates: boolean;
};

export type ConformanceContext = {
  readonly provider: GitProvider;
  readonly owners: { readonly organization: GitOwner; readonly user: GitOwner };
  readonly installationId: { readonly organization: string; readonly user: string };
  /** Jeton utilisateur valide pour `owners.user`. */
  readonly userCredentials: {
    readonly token: string;
    readonly expiresAt: string;
    readonly refreshToken?: string;
  };
  readonly capabilities: ConformanceCapabilities;
  /** Nom de dépôt unique à l'exécution (préfixe bac à sable en réel). */
  readonly uniqueName: (prefix: string) => string;
  /** Requis si `capabilities.deployments`. */
  readonly seedDeployment?: (
    repo: RepoRef,
    deployment: { environment: string; sha: string },
  ) => Promise<void>;
};

export type ConformanceFactory = () => Promise<ConformanceContext>;

const AUTHOR = { name: "Koklo Bot", email: "bot@koklo.test" } as const;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("la promesse s'est résolue alors qu'une erreur typée était attendue");
}

export function runGitProviderConformance(label: string, factory: ConformanceFactory): void {
  describe(`GitProvider conformance : ${label}`, () => {
    const withRepo = async () => {
      const ctx = await factory();
      const auth = await ctx.provider.authenticate({
        installation: { id: ctx.installationId.organization, owner: ctx.owners.organization },
      });
      const created = await ctx.provider.createRepo({
        auth,
        owner: ctx.owners.organization,
        name: ctx.uniqueName("conf"),
        visibility: "private",
      });
      return { ctx, auth, repo: created.ref, provider: ctx.provider, created };
    };

    const branchWithCommit = async (
      s: Awaited<ReturnType<typeof withRepo>>,
      name: string,
      files: ReadonlyArray<{ path: string; content: string }>,
      base = "main",
    ) => {
      await s.provider.createBranch({ auth: s.auth, repo: s.repo, base, name });
      return s.provider.writeCommit({
        auth: s.auth,
        repo: s.repo,
        branch: name,
        files,
        author: AUTHOR,
        message: `feat: ${name}`,
      });
    };

    describe("authenticate", () => {
      it("sans utilisateur : jeton d'installation avec expiration ISO UTC", async () => {
        const ctx = await factory();
        const auth = await ctx.provider.authenticate({
          installation: { id: ctx.installationId.organization, owner: ctx.owners.organization },
        });
        expect(auth.kind).toBe("installation");
        expect(auth.token.length).toBeGreaterThan(0);
        expect(auth.expiresAt).toMatch(ISO);
      });

      it("avec utilisateur valide : jeton utilisateur", async () => {
        const ctx = await factory();
        const auth = await ctx.provider.authenticate({
          installation: { id: ctx.installationId.user, owner: ctx.owners.user },
          user: ctx.userCredentials,
        });
        expect(auth.kind).toBe("user");
        expect(auth.token.length).toBeGreaterThan(0);
        expect(auth.expiresAt).toMatch(ISO);
      });

      it("jeton utilisateur expiré sans refreshToken : GitAuthExpiredError non rafraîchissable", async () => {
        const ctx = await factory();
        const error = await rejection(
          ctx.provider.authenticate({
            installation: { id: ctx.installationId.user, owner: ctx.owners.user },
            user: { token: ctx.userCredentials.token, expiresAt: "2000-01-01T00:00:00.000Z" },
          }),
        );
        expect(error).toBeInstanceOf(GitAuthExpiredError);
        expect(error).toMatchObject({ kind: "user", refreshable: false });
      });
    });

    describe("createRepo", () => {
      it("organisation avec jeton d'installation : dépôt privé, branche par défaut, URL", async () => {
        const { created, ctx } = await withRepo();
        expect(created.ref.owner).toEqual(ctx.owners.organization);
        expect(created.visibility).toBe("private");
        expect(created.defaultBranch).toBe("main");
        expect(created.htmlUrl).toContain(created.ref.name);
      });

      it("compte personnel avec jeton utilisateur : dépôt créé", async () => {
        const ctx = await factory();
        const auth = await ctx.provider.authenticate({
          installation: { id: ctx.installationId.user, owner: ctx.owners.user },
          user: ctx.userCredentials,
        });
        const repo = await ctx.provider.createRepo({
          auth,
          owner: ctx.owners.user,
          name: ctx.uniqueName("conf-user"),
          visibility: "private",
        });
        expect(repo.ref.owner).toEqual(ctx.owners.user);
      });

      it("compte personnel avec jeton d'installation : UserTokenRequiredError", async () => {
        const ctx = await factory();
        const auth = await ctx.provider.authenticate({
          installation: { id: ctx.installationId.user, owner: ctx.owners.user },
        });
        const error = await rejection(
          ctx.provider.createRepo({
            auth,
            owner: ctx.owners.user,
            name: ctx.uniqueName("conf-denied"),
            visibility: "private",
          }),
        );
        expect(error).toBeInstanceOf(UserTokenRequiredError);
        expect(error).toMatchObject({ owner: ctx.owners.user });
      });

      it("deuxième création du même nom : GitConflictError exists", async () => {
        const { ctx, auth, repo, provider } = await withRepo();
        const error = await rejection(
          provider.createRepo({
            auth,
            owner: ctx.owners.organization,
            name: repo.name,
            visibility: "private",
          }),
        );
        expect(error).toBeInstanceOf(GitConflictError);
        expect(error).toMatchObject({ reason: "exists" });
      });

      it("depuis un modèle : les fichiers du modèle sont présents", async (t) => {
        const s = await withRepo();
        if (!s.ctx.capabilities.templates) {
          console.warn("[conformance] cas sauté : capacité templates non déclarée");
          t.skip("capacité templates non déclarée");
        }
        await s.provider.writeCommit({
          auth: s.auth,
          repo: s.repo,
          branch: "main",
          files: [{ path: "TEMPLATE.md", content: "modèle" }],
          author: AUTHOR,
          message: "chore: modèle",
        });
        const copy = await s.provider.createRepo({
          auth: s.auth,
          owner: s.ctx.owners.organization,
          name: s.ctx.uniqueName("conf-from-tpl"),
          visibility: "private",
          template: s.repo,
        });
        const file = await s.provider.readFile({
          auth: s.auth,
          repo: copy.ref,
          ref: "main",
          path: "TEMPLATE.md",
        });
        expect(file.content).toBe("modèle");
      });
    });

    describe("fichiers, commits et branches", () => {
      it("lecture d'un fichier absent : GitNotFoundError", async () => {
        const { auth, repo, provider } = await withRepo();
        const error = await rejection(
          provider.readFile({ auth, repo, ref: "main", path: "absent.txt" }),
        );
        expect(error).toBeInstanceOf(GitNotFoundError);
      });

      it("lecture dans un dépôt inconnu : GitNotFoundError", async () => {
        const { auth, repo, provider, ctx } = await withRepo();
        const error = await rejection(
          provider.readFile({
            auth,
            repo: { owner: repo.owner, name: ctx.uniqueName("inexistant") },
            ref: "main",
            path: "a.txt",
          }),
        );
        expect(error).toBeInstanceOf(GitNotFoundError);
      });

      it("commit de deux fichiers puis relecture exacte (UTF-8)", async () => {
        const { auth, repo, provider } = await withRepo();
        const commit = await provider.writeCommit({
          auth,
          repo,
          branch: "main",
          files: [
            { path: "docs/a.md", content: "bonjour é" },
            { path: "b.txt", content: "deux" },
          ],
          author: AUTHOR,
          message: "feat: deux fichiers",
        });
        expect(commit.sha.length).toBeGreaterThan(0);
        expect(commit.message).toBe("feat: deux fichiers");
        expect(commit.parents).toHaveLength(1);
        const a = await provider.readFile({ auth, repo, ref: "main", path: "docs/a.md" });
        const b = await provider.readFile({ auth, repo, ref: "main", path: "b.txt" });
        expect([a.content, b.content]).toEqual(["bonjour é", "deux"]);
        expect(a.path).toBe("docs/a.md");
        expect(a.sha.length).toBeGreaterThan(0);
      });

      it("commit sur une branche inexistante : GitNotFoundError", async () => {
        const { auth, repo, provider } = await withRepo();
        const error = await rejection(
          provider.writeCommit({
            auth,
            repo,
            branch: "nope",
            files: [{ path: "a.txt", content: "a" }],
            author: AUTHOR,
            message: "x",
          }),
        );
        expect(error).toBeInstanceOf(GitNotFoundError);
      });

      it("création de branche : même SHA que la base ; doublon : exists ; base inconnue : introuvable", async () => {
        const { auth, repo, provider } = await withRepo();
        const branch = await provider.createBranch({ auth, repo, base: "main", name: "feat-a" });
        expect(branch.name).toBe("feat-a");
        const dup = await rejection(
          provider.createBranch({ auth, repo, base: "main", name: "feat-a" }),
        );
        expect(dup).toBeInstanceOf(GitConflictError);
        expect(dup).toMatchObject({ reason: "exists" });
        const missing = await rejection(
          provider.createBranch({ auth, repo, base: "inconnue", name: "feat-b" }),
        );
        expect(missing).toBeInstanceOf(GitNotFoundError);
      });
    });

    describe("pull requests", () => {
      const openPr = async (
        s: Awaited<ReturnType<typeof withRepo>>,
        branch = "feat-pr",
        file = "pr.txt",
      ) => {
        const commit = await branchWithCommit(s, branch, [{ path: file, content: branch }]);
        const pr = await s.provider.createPullRequest({
          auth: s.auth,
          repo: s.repo,
          base: "main",
          head: branch,
          title: `PR ${branch}`,
          body: "corps",
        });
        return { commit, pr, ref: { repo: s.repo, number: pr.ref.number } };
      };

      it("création puis état : ouverte, tête, branches, titre", async () => {
        const s = await withRepo();
        const { commit, pr, ref } = await openPr(s);
        expect(pr.status).toBe("open");
        expect(pr.headSha).toBe(commit.sha);
        expect(pr).toMatchObject({
          baseBranch: "main",
          headBranch: "feat-pr",
          title: "PR feat-pr",
          body: "corps",
        });
        expect(pr.htmlUrl).toContain(String(pr.ref.number));
        const state = await s.provider.getPullRequestState({ auth: s.auth, pullRequest: ref });
        expect(state).toMatchObject({ status: "open", headSha: commit.sha, checks: [] });
      });

      it("PR d'un numéro inconnu : GitNotFoundError", async () => {
        const s = await withRepo();
        const error = await rejection(
          s.provider.getPullRequestState({
            auth: s.auth,
            pullRequest: { repo: s.repo, number: 987654 },
          }),
        );
        expect(error).toBeInstanceOf(GitNotFoundError);
      });

      it("commentaire : identifiant et URL", async () => {
        const s = await withRepo();
        const { ref } = await openPr(s);
        const comment = await s.provider.commentPullRequest({
          auth: s.auth,
          pullRequest: ref,
          body: "bonjour",
        });
        expect(comment.id.length).toBeGreaterThan(0);
        expect(comment.htmlUrl.length).toBeGreaterThan(0);
      });

      it("commentaire sur une PR inconnue : GitNotFoundError", async () => {
        const s = await withRepo();
        const error = await rejection(
          s.provider.commentPullRequest({
            auth: s.auth,
            pullRequest: { repo: s.repo, number: 987654 },
            body: "x",
          }),
        );
        expect(error).toBeInstanceOf(GitNotFoundError);
      });

      it("check publié : visible dans l'état de la PR", async () => {
        const s = await withRepo();
        const { commit, ref } = await openPr(s);
        const check = await s.provider.publishCheck({
          auth: s.auth,
          repo: s.repo,
          sha: commit.sha,
          check: {
            name: "koklo/policy",
            status: "completed",
            conclusion: "success",
            summary: "ok",
          },
        });
        expect(check).toMatchObject({
          name: "koklo/policy",
          sha: commit.sha,
          status: "completed",
          conclusion: "success",
        });
        const state = await s.provider.getPullRequestState({ auth: s.auth, pullRequest: ref });
        expect(state.checks.map((c) => c.name)).toContain("koklo/policy");
      });

      it("fusion avec le bon expectedHeadSha : fusionnée, SHA rendu, état merged", async () => {
        const s = await withRepo();
        const { commit, ref } = await openPr(s);
        const result = await s.provider.mergePullRequest({
          auth: s.auth,
          pullRequest: ref,
          method: "squash",
          expectedHeadSha: commit.sha,
        });
        expect(result.sha.length).toBeGreaterThan(0);
        const state = await s.provider.getPullRequestState({ auth: s.auth, pullRequest: ref });
        expect(state.status).toBe("merged");
        expect(state.mergedSha).toBe(result.sha);
      });

      it("fusion avec un SHA périmé : stale-sha et la PR reste ouverte", async () => {
        const s = await withRepo();
        const { commit, ref } = await openPr(s);
        await s.provider.writeCommit({
          auth: s.auth,
          repo: s.repo,
          branch: "feat-pr",
          files: [{ path: "pr.txt", content: "plus récent" }],
          author: AUTHOR,
          message: "fix: plus récent",
        });
        const error = await rejection(
          s.provider.mergePullRequest({
            auth: s.auth,
            pullRequest: ref,
            method: "merge",
            expectedHeadSha: commit.sha,
          }),
        );
        expect(error).toBeInstanceOf(GitConflictError);
        expect(error).toMatchObject({ reason: "stale-sha" });
        const state = await s.provider.getPullRequestState({ auth: s.auth, pullRequest: ref });
        expect(state.status).toBe("open");
      });

      it("PR en conflit avec la base : not-mergeable (le SHA attendu étant correct)", async () => {
        const s = await withRepo();
        const first = await openPr(s, "feat-one", "shared.txt");
        const second = await openPr(s, "feat-two", "shared.txt");
        await s.provider.mergePullRequest({
          auth: s.auth,
          pullRequest: first.ref,
          method: "merge",
          expectedHeadSha: first.commit.sha,
        });
        const error = await rejection(
          s.provider.mergePullRequest({
            auth: s.auth,
            pullRequest: second.ref,
            method: "merge",
            expectedHeadSha: second.commit.sha,
          }),
        );
        expect(error).toBeInstanceOf(GitConflictError);
        expect(error).toMatchObject({ reason: "not-mergeable" });
      });

      it("mergeable calculé : faux pour la PR en conflit", async (t) => {
        const s = await withRepo();
        if (!s.ctx.capabilities.mergeableComputed) {
          console.warn("[conformance] cas sauté : capacité mergeableComputed non déclarée");
          t.skip("capacité mergeableComputed non déclarée");
        }
        const first = await openPr(s, "feat-one", "shared.txt");
        const second = await openPr(s, "feat-two", "shared.txt");
        await s.provider.mergePullRequest({
          auth: s.auth,
          pullRequest: first.ref,
          method: "merge",
          expectedHeadSha: first.commit.sha,
        });
        const state = await s.provider.getPullRequestState({
          auth: s.auth,
          pullRequest: second.ref,
        });
        expect(state.mergeable).toBe(false);
      });
    });

    describe("tags, déploiements, webhooks", () => {
      it("tag léger sur main : SHA de main ; doublon : exists", async () => {
        const s = await withRepo();
        const head = await s.provider.writeCommit({
          auth: s.auth,
          repo: s.repo,
          branch: "main",
          files: [{ path: "v.txt", content: "1" }],
          author: AUTHOR,
          message: "chore: v1",
        });
        const tag = await s.provider.createTag({
          auth: s.auth,
          repo: s.repo,
          ref: "main",
          name: "v1.0.0",
        });
        expect(tag).toEqual({ name: "v1.0.0", sha: head.sha });
        const error = await rejection(
          s.provider.createTag({ auth: s.auth, repo: s.repo, ref: "main", name: "v1.0.0" }),
        );
        expect(error).toBeInstanceOf(GitConflictError);
        expect(error).toMatchObject({ reason: "exists" });
      });

      it("déploiements : liste vide pour un dépôt neuf", async () => {
        const s = await withRepo();
        expect(
          await s.provider.listDeployments({ auth: s.auth, repo: s.repo, ref: "main" }),
        ).toEqual([]);
      });

      it("déploiements : un déploiement créé apparaît (capacité deployments)", async (t) => {
        const s = await withRepo();
        const seed = s.ctx.seedDeployment;
        if (!s.ctx.capabilities.deployments || seed === undefined) {
          console.warn("[conformance] cas sauté : capacité deployments non déclarée");
          t.skip("capacité deployments non déclarée");
          return;
        }
        const head = await s.provider.writeCommit({
          auth: s.auth,
          repo: s.repo,
          branch: "main",
          files: [{ path: "d.txt", content: "d" }],
          author: AUTHOR,
          message: "chore: deploy",
        });
        await seed(s.repo, { environment: "staging", sha: head.sha });
        const list: readonly Deployment[] = await s.provider.listDeployments({
          auth: s.auth,
          repo: s.repo,
          ref: "main",
        });
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({ environment: "staging", sha: head.sha });
        expect(list[0]?.createdAt).toMatch(ISO);
      });

      it("abonnement aux webhooks : accepte tous les événements du port", async () => {
        const s = await withRepo();
        await expect(
          s.provider.subscribeWebhooks({
            auth: s.auth,
            subscription: { repo: s.repo, events: [...WEBHOOK_EVENTS] },
          }),
        ).resolves.toBeUndefined();
      });
    });
  });
}
