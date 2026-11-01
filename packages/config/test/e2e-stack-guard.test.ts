import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Garde du faux fournisseur Git (TK-49a, ADR 0010). Le faux (`@koklo/github/testing`) n'est branché
 * que par le lanceur de pile e2e (`e2e/scripts/stack.ts`) ; il ne doit jamais entrer dans le code
 * livré, ni être démarrable en staging ou en production.
 */
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const FAKE_IMPORT = /@koklo\/github\/testing|github\/src\/testing/;
const SOURCE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

function sourceRoots(): string[] {
  return ["apps", "packages"].flatMap((group) =>
    readdirSync(join(repoRoot, group))
      .map((name) => join(repoRoot, group, name, "src"))
      .filter((dir) => statSync(dir, { throwIfNoEntry: false })?.isDirectory()),
  );
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (SOURCE.test(entry.name)) yield path;
  }
}

describe("le faux fournisseur reste hors du code de production", () => {
  it("aucun code de production n'importe @koklo/github/testing", () => {
    const fakeHome = join(repoRoot, "packages/github/src/testing");
    const offenders = sourceRoots()
      .flatMap((dir) => [...walk(dir)])
      .filter((file) => !file.startsWith(`${fakeHome}/`) && !TEST_FILE.test(file))
      .filter((file) => FAKE_IMPORT.test(readFileSync(file, "utf8")))
      .map((file) => relative(repoRoot, file));
    expect(offenders).toEqual([]);
  });

  it("scanne bien les sources (garde contre une garde vide)", () => {
    expect(sourceRoots().length).toBeGreaterThan(5);
  });

  describe("le lanceur de pile e2e (e2e/scripts/stack.ts)", () => {
    const launcher = join(repoRoot, "e2e/scripts/stack.ts");

    it.each(["staging", "production"])("refuse de démarrer avec APP_ENV=%s", (appEnv) => {
      const result = spawnSync(process.execPath, [launcher], {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 20_000,
        // Pas de base, pas de port : le refus doit survenir avant tout démarrage.
        env: { PATH: process.env.PATH, APP_ENV: appEnv, PORT: "0" },
      });
      expect(result.status, result.stderr).not.toBe(0);
      expect(result.stderr).toMatch(/APP_ENV/);
      expect(result.stderr).toContain(appEnv);
      expect(result.stderr).not.toMatch(/Cannot find module|ERR_MODULE_NOT_FOUND/);
    });
  });
});
