import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { type GitOwner, type GitProvider, GitProviderUnavailableError } from "@koklo/domain";
import { InMemoryGitProvider } from "@koklo/github/testing";
import { describe, expect, it } from "vitest";
import { featureMd, tableYaml } from "./support/spec-files.ts";

/**
 * TK-45b §5.3 : la lecture des fichiers de spec (liste -> filtre `kindOf` -> `readFile` par paquets
 * de 8) est extraite d'`execute.ts` dans UN module partagé par `spec-write` et l'indexeur de push.
 * Contrat : `apps/worker/src/spec-read/read-spec.ts` exporte
 *   readSpecFiles(input: { provider: GitProvider; auth: GitAuth; repo: RepoRef;
 *     listing: { ref: string; files: readonly { path: string }[] }; specPath: string | null }
 *   ): Promise<SpecFile[]>      // SpecFile = { path (relatif à la racine de la spec), content }
 * Comportement identique à l'ancien `readSpec` d'execute.ts (les tests de TK-44b restent verts).
 */
const owner: GitOwner = { kind: "organization", login: "acme" };
const repo = { owner, name: "spec" };
const src = resolve(import.meta.dirname, "../src");

async function seed(files: Record<string, string>) {
  const inner = new InMemoryGitProvider({
    now: () => new Date(),
    nextId: (() => {
      let n = 0;
      return () => `id${n++}`;
    })(),
  });
  const auth = await inner.authenticate({ installation: { id: "1", owner } });
  await inner.createRepo({ auth, owner, name: "spec", visibility: "private" });
  await inner.writeCommit({
    auth,
    repo,
    branch: "main",
    files: Object.entries(files).map(([path, content]) => ({ path, content })),
    author: { name: "Bot", email: "bot@users.noreply.invalid" },
    message: "seed",
  });
  return { inner, auth, listing: await inner.listFiles({ auth, repo, ref: "main" }) };
}

async function load() {
  return (await import("../src/spec-read/read-spec.ts")) as {
    readSpecFiles(input: Record<string, unknown>): Promise<{ path: string; content: string }[]>;
  };
}

describe("readSpecFiles", () => {
  it("ne lit que les fichiers reconnus, chemins relatifs, contenu exact", async () => {
    const { readSpecFiles } = await load();
    const { inner, auth, listing } = await seed({
      "koklo.project.yaml": "projet: p\n",
      "features/F-001-a.md": featureMd("F-001", "A"),
      "data/tables/T-a.yaml": tableYaml("T-a"),
      "README.md": "ignoré",
      "docs/notes.txt": "ignoré",
    });

    const files = await readSpecFiles({ provider: inner, auth, repo, listing, specPath: null });

    expect(files.map((file) => file.path).sort()).toEqual([
      "data/tables/T-a.yaml",
      "features/F-001-a.md",
      "koklo.project.yaml",
    ]);
    expect(files.find((file) => file.path === "data/tables/T-a.yaml")?.content).toBe(
      tableYaml("T-a"),
    );
  });

  it("spec dans un monorepo : seuls les fichiers du dossier, relatifs, lus au chemin préfixé", async () => {
    const { readSpecFiles } = await load();
    const { inner, auth, listing } = await seed({
      "spec/features/F-001-a.md": featureMd("F-001", "A"),
      "autre/features/F-002-b.md": featureMd("F-002", "B"),
      "features/F-003-c.md": featureMd("F-003", "C"),
    });
    const reads: string[] = [];
    const spy = new Proxy(inner, {
      get: (target, name) =>
        name === "readFile"
          ? (request: { path: string; ref: string }) => {
              reads.push(`${request.ref}:${request.path}`);
              return target.readFile(request as never);
            }
          : Reflect.get(target, name),
    }) as unknown as GitProvider;

    const files = await readSpecFiles({ provider: spy, auth, repo, listing, specPath: "spec" });

    expect(files.map((file) => file.path)).toEqual(["features/F-001-a.md"]);
    expect(reads).toEqual([`${listing.ref}:spec/features/F-001-a.md`]);
  });
});

describe("readFile : concurrence et pannes", () => {
  it("lectures bornées à 8 simultanées, toutes effectuées", async () => {
    const { readSpecFiles } = await load();
    const many = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`data/tables/T-t${i}.yaml`, tableYaml(`T-t${i}`)]),
    );
    const { inner, auth, listing } = await seed(many);
    let running = 0;
    let peak = 0;
    const slow = new Proxy(inner, {
      get: (target, name) =>
        name === "readFile"
          ? async (request: never) => {
              running += 1;
              peak = Math.max(peak, running);
              await new Promise((done) => setTimeout(done, 5));
              running -= 1;
              return target.readFile(request);
            }
          : Reflect.get(target, name),
    }) as unknown as GitProvider;

    const files = await readSpecFiles({ provider: slow, auth, repo, listing, specPath: null });

    expect(files).toHaveLength(30);
    expect(peak).toBe(8);
  });

  it("une panne du fournisseur est propagée telle quelle (le job la classe)", async () => {
    const { readSpecFiles } = await load();
    const { inner, auth, listing } = await seed({ "data/tables/T-a.yaml": tableYaml("T-a") });
    const down = new Proxy(inner, {
      get: (target, name) =>
        name === "readFile"
          ? async () => {
              throw new GitProviderUnavailableError({ operation: "readFile" });
            }
          : Reflect.get(target, name),
    }) as unknown as GitProvider;

    await expect(
      readSpecFiles({ provider: down, auth, repo, listing, specPath: null }),
    ).rejects.toBeInstanceOf(GitProviderUnavailableError);
  });
});

describe("une seule implémentation de la lecture de spec", () => {
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sources(path);
      return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
    });

  it("seul le module partagé appelle readFile du port ; execute.ts ne définit plus readSpec", () => {
    const callers = sources(src)
      .filter((file) => /\.readFile\(/.test(readFileSync(file, "utf8")))
      .map((file) => relative(src, file));
    expect(callers).toEqual(["spec-read/read-spec.ts"]);
    expect(readFileSync(join(src, "spec-write/execute.ts"), "utf8")).not.toMatch(
      /function readSpec\b/,
    );
  });
});
