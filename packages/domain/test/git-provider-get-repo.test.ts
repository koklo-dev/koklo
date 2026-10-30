import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { GitAuth, GitProvider, Repo, RepoRef } from "../src/index.ts";
import { FAKE_EXPIRES_AT, FakeGitProvider } from "./git-provider.fake.ts";

/**
 * TK-43 (QB1) : `Repo.id` (identifiant du fournisseur, chaîne) et l'opération `getRepo` rejoignent
 * le port. `project_repos.external_id` est NOT NULL et les webhooks reliront le repo par cet
 * identifiant, jamais par « propriétaire/nom » qui change au renommage.
 */
const src = (file: string) => readFileSync(resolve(import.meta.dirname, "../src", file), "utf8");

const auth: GitAuth = { kind: "installation", token: "iat", expiresAt: FAKE_EXPIRES_AT };
const org = { kind: "organization", login: "acme" } as const;
const provider: GitProvider = new FakeGitProvider();

describe("TK-43 Repo.id", () => {
  it("Repo.id est une chaîne en lecture seule", () => {
    expectTypeOf<Repo["id"]>().toEqualTypeOf<string>();
    expect(src("git-repo.ts")).toMatch(/readonly id: string;/);
  });

  it("createRepo rend un repo dont l'id est une chaîne non vide", async () => {
    const repo = await provider.createRepo({
      auth,
      owner: org,
      name: "spec",
      visibility: "private",
    });
    expect(typeof repo.id).toBe("string");
    expect(repo.id.length).toBeGreaterThan(0);
  });
});

describe("TK-43 getRepo", () => {
  it("fait partie du port : getRepo({ auth, repo }) -> Promise<Repo>", () => {
    expectTypeOf<GitProvider>().toHaveProperty("getRepo");
    expectTypeOf<Parameters<GitProvider["getRepo"]>[0]>().toEqualTypeOf<{
      auth: GitAuth;
      repo: RepoRef;
    }>();
    expectTypeOf<ReturnType<GitProvider["getRepo"]>>().toEqualTypeOf<Promise<Repo>>();
    expect(src("git-provider.ts")).toMatch(/getRepo\(request: \{/);
  });

  it("documente GitNotFoundError pour un repo introuvable", () => {
    expect(src("git-provider.ts")).toMatch(/@throws GitNotFoundError\s*\*\/\s*getRepo\(/);
  });

  it("le faux du domaine implémente getRepo et rend l'id de createRepo", async () => {
    const created = await provider.createRepo({
      auth,
      owner: org,
      name: "spec",
      visibility: "private",
    });
    const read = await provider.getRepo({ auth, repo: created.ref });
    expect(read.id).toBe(created.id);
    expect(read.ref).toEqual(created.ref);
  });
});
