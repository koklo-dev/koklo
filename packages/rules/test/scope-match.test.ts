import { describe, expect, it } from "vitest";
import { isValidPattern, matchesAny, matchesPath, normalizePath } from "../src/index.ts";

describe("matchesPath (matcher minimal maison, D6)", () => {
  it.each([
    ["packages/api/**", "packages/api/src/a.ts", true],
    ["packages/api/**", "packages/api", true],
    ["packages/api/**", "packages/apix/a.ts", false],
    ["packages/api", "packages/api/src/a.ts", true],
    ["packages/api", "packages/api", true],
    ["packages/api", "packages/apix", false],
    ["*.ts", "a.ts", true],
    ["*.ts", "src/a.ts", false],
    ["**/*.ts", "a.ts", true],
    ["**/*.ts", "src/deep/er/a.ts", true],
    ["**/*.ts", "a.tsx", false],
    ["src/*/index.ts", "src/x/index.ts", true],
    ["src/*/index.ts", "src/x/y/index.ts", false],
    ["src/**/index.ts", "src/x/y/index.ts", true],
    ["src/**/index.ts", "src/index.ts", true],
    ["a*c", "abbc", true],
    ["a*c", "a/c", false],
    ["**", "anything/at/all", true],
    ["**", ".", true],
    ["README.md", "readme.md", false],
    ["a.b", "axb", false],
    ["a+b", "a+b", true],
    ["a[1]", "a1", false],
    ["a[1]", "a[1]", true],
  ])("motif %s sur %s -> %s", (pattern, path, expected) => {
    expect(matchesPath(pattern, path)).toBe(expected);
  });
});

describe("matchesPath : dotfiles et invalides", () => {
  it.each([
    ["**", ".github/workflows/ci.yml", true],
    ["*", ".env", true],
    [".github/**", ".github/workflows/ci.yml", true],
    ["**/*.yml", ".github/workflows/ci.yml", true],
    [".env", ".env", true],
    [".env", "env", false],
  ])("dotfiles : %s sur %s -> %s", (pattern, path, expected) => {
    expect(matchesPath(pattern, path)).toBe(expected);
  });

  it.each([["../x"], ["a/../b"], ["/abs/**"], [""], ["a\\b"], ["a/../.."]])(
    "motif invalide %j : jamais de correspondance",
    (pattern) => {
      expect(isValidPattern(pattern)).toBe(false);
      expect(matchesPath(pattern, "a/b")).toBe(false);
      expect(matchesPath(pattern, ".")).toBe(false);
    },
  );
  it.each([["../a"], ["/a"], ["a/../b"]])(
    "chemin invalide %j : jamais de correspondance",
    (path) => {
      expect(matchesPath("**", path)).toBe(false);
    },
  );
  it.each([["**"], ["a/b"], [".github/**"], ["*.ts"], ["..hidden/x"]])("motif valide %j", (p) => {
    expect(isValidPattern(p)).toBe(true);
  });
});

describe("matchesAny : ordre sans effet", () => {
  const patterns = ["docs/**", "packages/api/**", "*.md", "src/*/x.ts"];
  const perms = [
    patterns,
    [...patterns].reverse(),
    [patterns[2], patterns[0], patterns[3], patterns[1]],
  ] as string[][];
  it.each(["packages/api/a.ts", "README.md", "zzz/none.ts", "src/q/x.ts"])("chemin %s", (path) => {
    const results = perms.map((p) => matchesAny(p, path));
    expect(new Set(results).size).toBe(1);
  });
  it("liste vide : faux ; correspondance sur n'importe quel motif : vrai", () => {
    expect(matchesAny([], "a")).toBe(false);
    expect(matchesAny(patterns, "docs/a/b.md")).toBe(true);
    expect(matchesAny(patterns, "other/b.ts")).toBe(false);
  });
});

describe("normalizePath", () => {
  it.each([
    [".", "."],
    ["", "."],
    ["./", "."],
    ["./a/b", "a/b"],
    ["a//b", "a/b"],
    ["a/b/", "a/b"],
    ["a/./b", "a/b"],
    [".github/x", ".github/x"],
    ["..hidden/x", "..hidden/x"],
  ])("%j -> %j", (path, expected) => {
    expect(normalizePath(path)).toBe(expected);
  });
  it.each([["../a"], ["a/../b"], ["a/b/.."], ["/abs"], ["a\\b"], ["a\0b"], [".."]])(
    "%j est invalide",
    (path) => {
      expect(normalizePath(path)).toBeUndefined();
    },
  );
});
