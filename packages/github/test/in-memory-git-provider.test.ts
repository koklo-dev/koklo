import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GitNotFoundError, type GitProvider } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import * as testing from "../src/testing/index.ts";
import { InMemoryGitProvider } from "../src/testing/index.ts";

const ORG = { kind: "organization", login: "acme" } as const;
const AUTHOR = { name: "Koklo", email: "bot@koklo.test" };

const make = () => {
  let ids = 0;
  return new InMemoryGitProvider({
    now: () => new Date("2026-10-30T12:00:00.000Z"),
    nextId: () => String(++ids),
  });
};

async function scenario(provider: GitProvider) {
  const auth = await provider.authenticate({ installation: { id: "1", owner: ORG } });
  const repo = await provider.createRepo({ auth, owner: ORG, name: "demo", visibility: "private" });
  const commit = await provider.writeCommit({
    auth,
    repo: repo.ref,
    branch: "main",
    files: [{ path: "a.txt", content: "a" }],
    author: AUTHOR,
    message: "feat: a",
  });
  return { auth, token: auth.token, expiresAt: auth.expiresAt, repo: repo.ref, commit };
}

describe("CA4 InMemoryGitProvider", () => {
  it("exporte InMemoryGitProvider par le sous-chemin testing", () => {
    expect(testing).toHaveProperty("InMemoryGitProvider");
  });

  it("est déterministe : deux instances identiques rejouent les mêmes SHA, jetons et dates", async () => {
    const [a, b] = [await scenario(make()), await scenario(make())];
    expect(a.commit).toEqual(b.commit);
    expect([a.token, a.expiresAt]).toEqual([b.token, b.expiresAt]);
  });

  it("chaque instance part vide et reste isolée des autres", async () => {
    const first = make();
    const second = make();
    const { auth, repo } = await scenario(first);
    const error = await second.readFile({ auth, repo, ref: "main", path: "a.txt" }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(GitNotFoundError);
  });

  it("l'horloge injectée fixe l'expiration du jeton d'installation (pas d'horloge cachée)", async () => {
    const provider = make();
    const auth = await provider.authenticate({ installation: { id: "1", owner: ORG } });
    expect(Date.parse(auth.expiresAt)).toBeGreaterThan(Date.parse("2026-10-30T12:00:00.000Z"));
    expect(Date.parse(auth.expiresAt)).toBeLessThanOrEqual(Date.parse("2026-10-30T13:00:00.000Z"));
  });

  it("src/testing ne dépend pas d'Octokit (le sous-chemin se charge sans lui)", () => {
    const dir = resolve(import.meta.dirname, "../src/testing");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files).toContain("in-memory-git-provider.ts");
    expect(files).toContain("index.ts");
    for (const file of files) {
      expect(readFileSync(resolve(dir, file), "utf8"), file).not.toMatch(/octokit/i);
    }
  });
});
