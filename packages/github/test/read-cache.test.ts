import {
  type FileContent,
  type FileListing,
  type GitAuth,
  GitNotFoundError,
  type GitProvider,
  GitProviderUnavailableError,
  GitRateLimitedError,
  type RepoRef,
} from "@koklo/domain";
import { describe, expect, it } from "vitest";
import {
  cachedGitReads,
  GIT_READ_CACHE_MAX_BYTES,
  GIT_READ_CACHE_MAX_ENTRIES,
  GIT_READ_CACHE_MAX_LISTINGS,
  GIT_READ_CACHE_TTL_MS,
  GitReadCache,
} from "../src/index.ts";

/**
 * TK-114f (B687 à B690) : lectures git au SHA complet gardées en mémoire par installation et dépôt, frein pendant un
 * quota épuisé. Le faux compte les appels réseau ; `token` désigne l'installation qui a lu.
 */
const SHA1 = "a".repeat(40);
const SHA2 = "b".repeat(40);
const ORG = { kind: "organization", login: "acme" } as const;
const REPO: RepoRef = { owner: ORG, name: "spec" };
const auth = (token: string): GitAuth => ({ kind: "installation", token, expiresAt: "2026-12-01" });
const A = auth("A");

type Tree = Record<string, string>;
type Repos = Record<string, Record<string, Tree>>;

const blob = (content: string) => `blob-${content}`;

function fakeProvider(repos: Repos) {
  const calls = { readFile: 0, listFiles: 0, writeCommit: 0 };
  let failure: Error | undefined;
  let gate: Promise<void> | undefined;
  const treeOf = (request: { auth: GitAuth; repo: RepoRef; ref: string }) => {
    const key = `${request.auth.token}/${request.repo.owner.login}/${request.repo.name}`;
    const ref = request.ref === "main" ? SHA1 : request.ref;
    return { ref, tree: repos[key]?.[ref] };
  };
  const provider = {
    authenticate: async () => A,
    readFile: async (request: { auth: GitAuth; repo: RepoRef; ref: string; path: string }) => {
      calls.readFile += 1;
      await gate;
      if (failure) throw failure;
      const { ref, tree } = treeOf(request);
      const content = tree?.[request.path];
      if (content === undefined) {
        throw new GitNotFoundError({ operation: "readFile", resource: "file", identifier: "x" });
      }
      return { path: request.path, ref, content, sha: blob(content) } satisfies FileContent;
    },
    listFiles: async (request: { auth: GitAuth; repo: RepoRef; ref: string }) => {
      calls.listFiles += 1;
      if (failure) throw failure;
      const { ref, tree } = treeOf(request);
      const files = Object.entries(tree ?? {}).map(([path, content]) => ({
        path,
        sha: blob(content),
      }));
      return { ref, files } satisfies FileListing;
    },
    writeCommit: async (request: unknown) => {
      calls.writeCommit += 1;
      return { written: request };
    },
  };
  return {
    provider: provider as unknown as GitProvider,
    calls,
    fail: (error: Error | undefined) => {
      failure = error;
    },
    hold: () => {
      let release = () => {};
      gate = new Promise((resolve) => {
        release = resolve;
      });
      return () => {
        gate = undefined;
        release();
      };
    },
  };
}

const clock = (start = 0) => {
  const state = { now: start };
  return { now: () => state.now, advance: (ms: number) => (state.now += ms) };
};

const read = (reads: GitProvider, path: string, ref = SHA1, who = A, repo = REPO) =>
  reads.readFile({ auth: who, repo, ref, path });

const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

const SPEC: Repos = { "A/acme/spec": { [SHA1]: { "a.yaml": "un", "b.yaml": "deux" } } };

describe("GitReadCache (TK-114f, A1)", () => {
  it("exporte les bornes par défaut (B689)", () => {
    expect(GIT_READ_CACHE_MAX_BYTES).toBe(32 * 1024 * 1024);
    expect(GIT_READ_CACHE_MAX_ENTRIES).toBe(5000);
    expect(GIT_READ_CACHE_MAX_LISTINGS).toBe(64);
    expect(GIT_READ_CACHE_TTL_MS).toBe(3_600_000);
  });

  it("2e lecture même installation, dépôt, SHA et chemin : aucun appel", async () => {
    const fake = fakeProvider(SPEC);
    const reads = cachedGitReads(fake.provider, new GitReadCache(), { installationId: "i1" });
    expect((await read(reads, "a.yaml")).content).toBe("un");
    expect(await read(reads, "a.yaml")).toEqual({
      path: "a.yaml",
      ref: SHA1,
      content: "un",
      sha: blob("un"),
    });
    expect(fake.calls.readFile).toBe(1);
  });

  it("404 gardé : la 2e lecture lève GitNotFoundError sans appel", async () => {
    const fake = fakeProvider(SPEC);
    const reads = cachedGitReads(fake.provider, new GitReadCache(), { installationId: "i1" });
    expect(await rejection(read(reads, "absent.md"))).toBeInstanceOf(GitNotFoundError);
    expect(await rejection(read(reads, "absent.md"))).toBeInstanceOf(GitNotFoundError);
    expect(fake.calls.readFile).toBe(1);
  });

  it("arbre du commit en cache : un chemin absent lève GitNotFoundError sans lecture", async () => {
    const fake = fakeProvider(SPEC);
    const reads = cachedGitReads(fake.provider, new GitReadCache(), { installationId: "i1" });
    await reads.listFiles({ auth: A, repo: REPO, ref: SHA1 });
    await reads.listFiles({ auth: A, repo: REPO, ref: SHA1 });
    expect(await rejection(read(reads, "flows/absent.mmd"))).toBeInstanceOf(GitNotFoundError);
    expect(fake.calls).toMatchObject({ listFiles: 1, readFile: 0 });
  });

  it("blob inchangé entre deux commits : un seul readFile", async () => {
    const repos: Repos = {
      "A/acme/spec": { [SHA1]: { "a.yaml": "un" }, [SHA2]: { "a.yaml": "un", "c.yaml": "neuf" } },
    };
    const fake = fakeProvider(repos);
    const reads = cachedGitReads(fake.provider, new GitReadCache(), { installationId: "i1" });
    await reads.listFiles({ auth: A, repo: REPO, ref: SHA1 });
    await read(reads, "a.yaml", SHA1);
    await reads.listFiles({ auth: A, repo: REPO, ref: SHA2 });
    expect(await read(reads, "a.yaml", SHA2)).toMatchObject({ ref: SHA2, content: "un" });
    expect(fake.calls.readFile).toBe(1);
  });

  it("ref de branche : jamais servi par le cache, mais l'arbre rendu est rangé sous son SHA", async () => {
    const fake = fakeProvider(SPEC);
    const reads = cachedGitReads(fake.provider, new GitReadCache(), { installationId: "i1" });
    await read(reads, "a.yaml", "main");
    await read(reads, "a.yaml", "main");
    await reads.listFiles({ auth: A, repo: REPO, ref: "main" });
    await reads.listFiles({ auth: A, repo: REPO, ref: "main" });
    expect(fake.calls).toMatchObject({ readFile: 2, listFiles: 2 });
    await reads.listFiles({ auth: A, repo: REPO, ref: SHA1 });
    expect(fake.calls.listFiles).toBe(2);
  });

  it("une erreur autre que 404 n'est pas gardée", async () => {
    const fake = fakeProvider(SPEC);
    const reads = cachedGitReads(fake.provider, new GitReadCache(), { installationId: "i1" });
    fake.fail(new GitProviderUnavailableError({ operation: "readFile" }));
    expect(await rejection(read(reads, "a.yaml"))).toBeInstanceOf(GitProviderUnavailableError);
    fake.fail(undefined);
    expect((await read(reads, "a.yaml")).content).toBe("un");
    expect(fake.calls.readFile).toBe(2);
  });

  it("une entrée expirée (TTL, horloge injectée) est relue", async () => {
    const time = clock();
    const fake = fakeProvider(SPEC);
    const cache = new GitReadCache({ ttlMs: 1000, now: time.now });
    const reads = cachedGitReads(fake.provider, cache, { installationId: "i1" });
    await read(reads, "a.yaml");
    time.advance(999);
    await read(reads, "a.yaml");
    expect(fake.calls.readFile).toBe(1);
    time.advance(2);
    await read(reads, "a.yaml");
    expect(fake.calls.readFile).toBe(2);
  });

  it("évince la plus ancienne entrée au-delà du nombre d'entrées", async () => {
    const fake = fakeProvider(SPEC);
    const cache = new GitReadCache({ maxEntries: 2 });
    const reads = cachedGitReads(fake.provider, cache, { installationId: "i1" });
    await read(reads, "a.yaml");
    await read(reads, "b.yaml");
    await read(reads, "b.yaml");
    expect(fake.calls.readFile).toBe(2);
    await read(reads, "a.yaml");
    expect(fake.calls.readFile).toBe(3);
  });

  it("évince au-delà du budget d'octets (2 octets par caractère) et ne garde pas un contenu trop gros", async () => {
    const big = "x".repeat(1024 * 1024 + 1);
    const repos: Repos = { "A/acme/spec": { [SHA1]: { "a.yaml": "un", "big.md": big } } };
    const fake = fakeProvider(repos);
    const cache = new GitReadCache({ maxBytes: 3 });
    const reads = cachedGitReads(fake.provider, cache, { installationId: "i1" });
    await read(reads, "a.yaml");
    await read(reads, "a.yaml");
    expect(fake.calls.readFile).toBe(2);
    const roomy = cachedGitReads(fake.provider, new GitReadCache(), { installationId: "i1" });
    await read(roomy, "big.md");
    await read(roomy, "big.md");
    expect(fake.calls.readFile).toBe(4);
  });

  it("garde au plus maxListings arbres", async () => {
    const repos: Repos = { "A/acme/spec": { [SHA1]: { "a.yaml": "un" }, [SHA2]: {} } };
    const fake = fakeProvider(repos);
    const reads = cachedGitReads(fake.provider, new GitReadCache({ maxListings: 1 }), {
      installationId: "i1",
    });
    await reads.listFiles({ auth: A, repo: REPO, ref: SHA1 });
    await reads.listFiles({ auth: A, repo: REPO, ref: SHA2 });
    await reads.listFiles({ auth: A, repo: REPO, ref: SHA1 });
    expect(fake.calls.listFiles).toBe(3);
  });

  it("lectures simultanées identiques : un seul appel", async () => {
    const fake = fakeProvider(SPEC);
    const reads = cachedGitReads(fake.provider, new GitReadCache(), { installationId: "i1" });
    const release = fake.hold();
    const pending = [read(reads, "a.yaml"), read(reads, "a.yaml"), read(reads, "a.yaml")];
    release();
    expect((await Promise.all(pending)).map((file) => file.content)).toEqual(["un", "un", "un"]);
    expect(fake.calls.readFile).toBe(1);
  });

  it("quota épuisé : plus aucun appel jusqu'à l'échéance, délai restant rendu, puis reprise", async () => {
    const time = clock();
    const fake = fakeProvider(SPEC);
    const cache = new GitReadCache({ now: time.now });
    const reads = cachedGitReads(fake.provider, cache, { installationId: "i1" });
    fake.fail(new GitRateLimitedError({ operation: "readFile", retryAfterMs: 120_000 }));
    expect(await rejection(read(reads, "a.yaml"))).toBeInstanceOf(GitRateLimitedError);
    fake.fail(undefined);
    time.advance(30_000);
    const braked = await rejection(read(reads, "b.yaml", "main"));
    expect(braked).toBeInstanceOf(GitRateLimitedError);
    expect((braked as GitRateLimitedError).retryAfterMs).toBe(90_000);
    expect(await rejection(reads.listFiles({ auth: A, repo: REPO, ref: SHA1 }))).toBeInstanceOf(
      GitRateLimitedError,
    );
    expect(fake.calls).toMatchObject({ readFile: 1, listFiles: 0 });
    const other = cachedGitReads(fake.provider, cache, { installationId: "i2" });
    expect((await read(other, "a.yaml")).content).toBe("un");
    time.advance(90_000);
    expect((await read(reads, "a.yaml")).content).toBe("un");
    expect(fake.calls.readFile).toBe(3);
  });

  it("frein : 60 s sans délai annoncé, 1 h au plus", async () => {
    const time = clock();
    const fake = fakeProvider(SPEC);
    const cache = new GitReadCache({ now: time.now });
    const reads = cachedGitReads(fake.provider, cache, { installationId: "i1" });
    fake.fail(new GitRateLimitedError({ operation: "readFile", retryAfterMs: undefined }));
    await rejection(read(reads, "a.yaml"));
    const first = await rejection(read(reads, "a.yaml"));
    expect((first as GitRateLimitedError).retryAfterMs).toBe(60_000);
    time.advance(60_000);
    fake.fail(new GitRateLimitedError({ operation: "readFile", retryAfterMs: 10 * 3_600_000 }));
    await rejection(read(reads, "a.yaml"));
    const capped = await rejection(read(reads, "a.yaml"));
    expect((capped as GitRateLimitedError).retryAfterMs).toBe(3_600_000);
  });

  it("une entrée gardée reste servie pendant le frein", async () => {
    const fake = fakeProvider(SPEC);
    const reads = cachedGitReads(fake.provider, new GitReadCache(), { installationId: "i1" });
    await read(reads, "a.yaml");
    fake.fail(new GitRateLimitedError({ operation: "readFile", retryAfterMs: 60_000 }));
    await rejection(read(reads, "b.yaml"));
    expect((await read(reads, "a.yaml")).content).toBe("un");
  });

  it("les autres méthodes (écritures) sont déléguées telles quelles, sans frein", async () => {
    const fake = fakeProvider(SPEC);
    const reads = cachedGitReads(fake.provider, new GitReadCache(), { installationId: "i1" });
    fake.fail(new GitRateLimitedError({ operation: "readFile", retryAfterMs: 60_000 }));
    await rejection(read(reads, "a.yaml"));
    const request = { auth: A, repo: REPO, branch: "main", files: [], author: ORG, message: "m" };
    const written = await reads.writeCommit(request as never);
    expect(written).toEqual({ written: request });
    expect(fake.calls.writeCommit).toBe(1);
  });
});

describe("GitReadCache, isolation (TK-114f, A2)", () => {
  const repos: Repos = {
    "A/acme/spec": { [SHA1]: { "a.yaml": "de A" } },
    "B/acme/spec": { [SHA1]: { "a.yaml": "de B" } },
    "A/acme/autre": { [SHA1]: { "a.yaml": "autre dépôt" } },
    "A/perso/spec": { [SHA1]: { "a.yaml": "autre propriétaire" } },
  };

  it("installation B, même dépôt, SHA et chemin : appel réseau et contenu de B", async () => {
    const fake = fakeProvider(repos);
    const cache = new GitReadCache();
    const forA = cachedGitReads(fake.provider, cache, { installationId: "iA" });
    const forB = cachedGitReads(fake.provider, cache, { installationId: "iB" });
    expect((await read(forA, "a.yaml")).content).toBe("de A");
    expect((await read(forB, "a.yaml", SHA1, auth("B"))).content).toBe("de B");
    expect(fake.calls.readFile).toBe(2);
  });

  it("même installation, autre dépôt ou autre propriétaire : pas de partage", async () => {
    const fake = fakeProvider(repos);
    const reads = cachedGitReads(fake.provider, new GitReadCache(), { installationId: "iA" });
    const other: RepoRef = { owner: ORG, name: "autre" };
    const user: RepoRef = { owner: { kind: "user", login: "perso" }, name: "spec" };
    expect((await read(reads, "a.yaml")).content).toBe("de A");
    expect((await read(reads, "a.yaml", SHA1, A, other)).content).toBe("autre dépôt");
    expect((await read(reads, "a.yaml", SHA1, A, user)).content).toBe("autre propriétaire");
    expect(fake.calls.readFile).toBe(3);
  });
});
