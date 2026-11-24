import type { GitProvider } from "@koklo/domain";
import { GitReadCache } from "@koklo/github";
import { InMemoryGitProvider } from "@koklo/github/testing";
import { createLogger } from "@koklo/observability";
import { describe, expect, it } from "vitest";
import type { IndexWriter } from "../src/webhook/index-writer.ts";
import { indexBranch, type PushDeps } from "../src/webhook/push.ts";
import type { TargetStore } from "../src/webhook/target-store.ts";
import type { Target } from "../src/webhook/types.ts";

/**
 * TK-114f lot A (A4, B691) : l'indexation d'un commit lit au SHA du listage par le cache du worker ; un blob inchangé
 * depuis le commit précédent n'est pas relu. Sans cache : comportement d'avant (tous les fichiers relus).
 */
const ORG = { kind: "organization", login: "acme" } as const;
const AUTHOR = { name: "Koklo", email: "bot@koklo.test" };
const TARGET: Target = {
  installation: {
    id: "inst-1",
    organizationId: "org-1",
    externalId: "42",
    status: "active",
    ownerKind: "organization",
    ownerLogin: "acme",
  },
  repo: {
    id: "repo-1",
    projectId: "p-1",
    name: "spec",
    ownerLogin: "acme",
    role: "spec",
    specPath: null,
  },
};

async function bench() {
  let ids = 0;
  const inner = new InMemoryGitProvider({
    now: () => new Date("2026-11-24T12:00:00.000Z"),
    nextId: () => String(++ids),
  });
  const auth = await inner.authenticate({ installation: { id: "42", owner: ORG } });
  const repo = await inner.createRepo({ auth, owner: ORG, name: "spec", visibility: "private" });
  const commit = (files: { path: string; content: string }[]) =>
    inner.writeCommit({
      auth,
      repo: repo.ref,
      branch: "main",
      files,
      author: AUTHOR,
      message: "m",
    });
  const reads: string[] = [];
  const provider = new Proxy(inner, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (property !== "readFile" || typeof value !== "function") {
        return typeof value === "function" ? value.bind(target) : value;
      }
      return (request: { path: string }) => {
        reads.push(request.path);
        return value.call(target, request);
      };
    },
  }) as unknown as GitProvider;
  return { provider, commit, reads };
}

const deps = (provider: GitProvider, readCache?: GitReadCache): PushDeps => ({
  targets: {
    snapshotOf: async () => null,
    moveHead: async () => {},
    deleteHead: async () => {},
  } as unknown as TargetStore,
  writer: { write: async () => ({ counterSkipped: 0 }) } as unknown as IndexWriter,
  provider,
  logger: createLogger({ level: "silent" }),
  ...(readCache === undefined ? {} : { readCache }),
});

const TABLES = [
  { path: "data/tables/T-a.yaml", content: "id: T-a\n" },
  { path: "data/tables/T-b.yaml", content: "id: T-b\n" },
];

describe("indexBranch et le cache de lecture (TK-114f, A4)", () => {
  it("deux commits dont un seul fichier change : la 2e indexation lit un fichier", async () => {
    const { provider, commit, reads } = await bench();
    const push = deps(provider, new GitReadCache());
    await commit(TABLES);
    await indexBranch(push, provider, TARGET, "main");
    const first = reads.length;
    await commit([{ path: "data/tables/T-b.yaml", content: "id: T-b\nnom: B\n" }]);
    await indexBranch(push, provider, TARGET, "main");
    expect(first).toBeGreaterThanOrEqual(2);
    expect(reads.slice(first)).toEqual(["data/tables/T-b.yaml"]);
  });

  it("sans readCache : chaque indexation relit tous les fichiers reconnus", async () => {
    const { provider, commit, reads } = await bench();
    const push = deps(provider);
    await commit(TABLES);
    await indexBranch(push, provider, TARGET, "main");
    const first = reads.length;
    await commit([{ path: "data/tables/T-b.yaml", content: "id: T-b\nnom: B\n" }]);
    await indexBranch(push, provider, TARGET, "main");
    expect(reads.length - first).toBe(first);
  });
});
