import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testDir = resolve(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(resolve(testDir, relative), "utf8");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(resolve(dir, entry.name)) : [resolve(dir, entry.name)],
  );

describe("CA2 incident 33 : un faux et un réel vérifiés par la même suite", () => {
  it("incident-33-fake-and-real-share-one-conformance-suite", () => {
    const suite = read("conformance/suite.ts");
    expect(suite).toMatch(/export function runGitProviderConformance\(/);
    expect(suite).toMatch(/incident 33/i);

    for (const entry of ["conformance/fake.test.ts", "real/github.real.ts"]) {
      const source = read(entry);
      expect(source, entry).toMatch(/from "(\.\.?\/)(conformance\/)?suite\.ts"/);
      expect(source, entry).toMatch(/runGitProviderConformance\(/);
    }
  });

  it("la suite n'est définie qu'une fois dans test/", () => {
    const definitions = walk(testDir).filter(
      (file) =>
        file.endsWith(".ts") &&
        !file.endsWith("shared-suite.test.ts") &&
        /(function|const)\s+runGitProviderConformance\b/.test(readFileSync(file, "utf8")),
    );
    expect(definitions.map((f) => f.replace(`${testDir}/`, ""))).toEqual(["conformance/suite.ts"]);
  });

  it("le point d'entrée réel utilise le vrai adaptateur, le point d'entrée CI le faux", () => {
    expect(read("real/github.real.ts")).toMatch(/createOctokitGitProvider/);
    expect(read("real/github.real.ts")).not.toMatch(/InMemoryGitProvider/);
    expect(read("conformance/fake.test.ts")).toMatch(/InMemoryGitProvider/);
    expect(read("conformance/fake.test.ts")).not.toMatch(/createOctokitGitProvider/);
  });

  it("la suite couvre les 13 opérations du port", () => {
    const suite = read("conformance/suite.ts");
    for (const op of [
      "authenticate",
      "createRepo",
      "readFile",
      "writeCommit",
      "createBranch",
      "createPullRequest",
      "getPullRequestState",
      "mergePullRequest",
      "createTag",
      "listDeployments",
      "publishCheck",
      "commentPullRequest",
      "subscribeWebhooks",
    ]) {
      expect(suite, op).toContain(`.${op}(`);
    }
  });

  it("les cas sautés par capacité sont explicites, jamais silencieux", () => {
    const suite = read("conformance/suite.ts");
    expect(suite.match(/t\.skip\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(suite.match(/console\.warn\(/g)?.length ?? 0).toBe(
      suite.match(/t\.skip\(/g)?.length ?? 0,
    );
  });
});
