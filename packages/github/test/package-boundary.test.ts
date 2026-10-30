import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pkgDir = resolve(import.meta.dirname, "..");
const repoRoot = resolve(pkgDir, "../..");
type Manifest = {
  name: string;
  private: boolean;
  type: string;
  exports: Record<string, unknown>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies?: Record<string, string>;
  tags?: string[];
  boundaries: { tags: Record<string, { dependencies: { allow: string[] } }> };
};
const json = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Manifest;
const OCTOKIT_PACKAGES = [
  "@octokit/auth-app",
  "@octokit/core",
  "@octokit/plugin-paginate-rest",
  "@octokit/plugin-rest-endpoint-methods",
  "@octokit/plugin-retry",
  "@octokit/plugin-throttling",
  "@octokit/request-error",
];

const workspacePackages = (): string[] =>
  ["apps", "packages"].flatMap((group) =>
    readdirSync(resolve(repoRoot, group))
      .map((name) => resolve(repoRoot, group, name))
      .filter((dir) => existsSync(resolve(dir, "package.json"))),
  );
const sources = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((name) => {
        if (["node_modules", "dist", ".next", "coverage", ".turbo"].includes(name)) return [];
        const path = resolve(dir, name);
        return statSync(path).isDirectory()
          ? sources(path)
          : /\.(ts|tsx|mjs|js)$/.test(name)
            ? [path]
            : [];
      })
    : [];

describe("CA1 identité et dépendances de @koklo/github", () => {
  const pkg = json(resolve(pkgDir, "package.json"));

  it("est privé, ESM, et expose . et ./testing", () => {
    expect(pkg).toMatchObject({ name: "@koklo/github", private: true, type: "module" });
    expect(Object.keys(pkg.exports).sort()).toEqual([".", "./testing"]);
  });

  it("dépend du seul domaine en production et des 7 paquets Octokit épinglés exactement", () => {
    const deps = pkg.dependencies;
    expect(Object.keys(deps).sort()).toEqual(["@koklo/domain", ...OCTOKIT_PACKAGES].sort());
    expect(deps["@koklo/domain"]).toBe("workspace:*");
    expect(deps).toMatchObject({
      "@octokit/core": "7.0.8",
      "@octokit/auth-app": "8.3.1",
      "@octokit/plugin-rest-endpoint-methods": "18.0.0",
      "@octokit/plugin-paginate-rest": "16.0.0",
      "@octokit/plugin-throttling": "11.0.5",
      "@octokit/plugin-retry": "8.1.1",
      "@octokit/request-error": "7.1.2",
    });
    for (const [name, version] of Object.entries(deps)) {
      if (name.startsWith("@octokit/")) expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("les seules dépendances de workspace sont domain et config", () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies } as Record<
      string,
      string
    >;
    const internal = Object.keys(all).filter((name) => name.startsWith("@koklo/"));
    expect(internal.sort()).toEqual(["@koklo/config", "@koklo/domain"]);
  });

  it("porte le tag turbo github", () => {
    expect(json(resolve(pkgDir, "turbo.json")).tags).toEqual(["github"]);
  });

  it("le tag github de la racine n'autorise ni delivery, ni api, ni worker, ni db", () => {
    const rules =
      json(resolve(repoRoot, "turbo.json")).boundaries.tags.github?.dependencies.allow ?? [];
    expect(rules).toEqual(expect.arrayContaining(["domain", "config"]));
    for (const forbidden of ["db", "delivery", "api", "worker", "web", "ui", "cli", "rules"]) {
      expect(rules).not.toContain(forbidden);
    }
  });

  it("les sources de production n'importent que domain et Octokit", () => {
    const files = sources(resolve(pkgDir, "src"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from "([^".][^"]*)"/g)) {
        expect(specifier, file).toMatch(/^(@koklo\/domain|@octokit\/[a-z-]+|node:[a-z/]+)$/);
      }
    }
  });
});

describe("frontière : domain ne connaît pas github, Octokit reste dans packages/github", () => {
  it("aucun autre paquet ne dépend d'Octokit ni ne le déclare", () => {
    for (const dir of workspacePackages().filter((d) => d !== pkgDir)) {
      const manifest = readFileSync(resolve(dir, "package.json"), "utf8");
      expect(manifest, dir).not.toMatch(/octokit/i);
    }
    expect(readFileSync(resolve(repoRoot, "package.json"), "utf8")).not.toMatch(/octokit/i);
  });

  it("aucun fichier source hors packages/github n'importe Octokit", () => {
    for (const dir of workspacePackages().filter((d) => d !== pkgDir)) {
      for (const file of sources(dir)) {
        if (file.endsWith("git-provider-boundary.test.ts")) continue;
        expect(readFileSync(file, "utf8"), file).not.toMatch(/from\s+["'](@octokit\/|octokit["'])/);
      }
    }
  });

  it("domain ne dépend pas de @koklo/github", () => {
    const manifest = json(resolve(repoRoot, "packages/domain/package.json"));
    const all = { ...manifest.dependencies, ...manifest.devDependencies };
    expect(Object.keys(all)).not.toContain("@koklo/github");
    const allowed = json(resolve(repoRoot, "turbo.json")).boundaries.tags.domain?.dependencies
      .allow;
    expect(allowed).toBeDefined();
    expect(allowed).not.toContain("github");
  });

  it("le port reste dans domain (git-provider.ts) sans dépendre de github", () => {
    for (const file of sources(resolve(repoRoot, "packages/domain/src"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/@koklo\/github/);
    }
  });
});
