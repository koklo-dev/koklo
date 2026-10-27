import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { main } from "../src/check-deep-imports.ts";
import { findDeepImports } from "../src/deep-imports.ts";

const configDir = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixtures = fileURLToPath(new URL("../fixtures/boundaries/", import.meta.url));
const rootTurbo = JSON.parse(readFileSync(join(repoRoot, "turbo.json"), "utf8"));

const workdirs: string[] = [];

/** Copie la fixture hors du dépôt et lui applique les règles `boundaries` du turbo.json racine. */
function turboBoundaries(fixture: string) {
  const dir = mkdtempSync(join(tmpdir(), "koklo-boundaries-"));
  workdirs.push(dir);
  cpSync(join(fixtures, fixture), dir, { recursive: true });
  writeFileSync(
    join(dir, "turbo.json"),
    JSON.stringify({ tasks: {}, boundaries: rootTurbo.boundaries }),
  );
  const result = spawnSync(join(repoRoot, "node_modules/.bin/turbo"), ["boundaries"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, TURBO_TELEMETRY_DISABLED: "1" },
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

afterAll(() => {
  for (const dir of workdirs) rmSync(dir, { recursive: true, force: true });
});

describe("frontières entre paquets (turbo boundaries)", () => {
  it("accepte un workspace conforme au §16.4", () => {
    const result = turboBoundaries("valid");
    expect(result.output).not.toMatch(/error/i);
    expect(result.status).toBe(0);
  });

  it("refuse que `domain` dépende de `db`", () => {
    const result = turboBoundaries("domain-depends-on-db");
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("@fixture/db");
  });
});

describe("imports profonds (check-deep-imports)", () => {
  it("refuse un import profond (pkg/src/...) dans une fixture", () => {
    const result = spawnSync(
      process.execPath,
      [join(configDir, "src/check-deep-imports.ts"), join(fixtures, "deep-import")],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"@fixture/ui/src/button"');
  });

  it("accepte un import via les exports déclarés", () => {
    expect(findDeepImports(join(fixtures, "valid"))).toEqual([]);
  });

  it("refuse tout sous-chemin d'un paquet sans `exports`", () => {
    const violations = findDeepImports(join(fixtures, "deep-import"));
    expect(violations).toEqual([
      {
        file: join("packages", "web", "src", "index.ts"),
        specifier: "@fixture/ui/src/button",
        pkg: "@fixture/ui",
      },
    ]);
  });

  it("honore les motifs `*` des exports et ignore les dossiers sans paquet", () => {
    const dir = mkdtempSync(join(tmpdir(), "koklo-exports-"));
    workdirs.push(dir);
    const write = (path: string, content: string) => {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    };
    write("pnpm-workspace.yaml", 'packages:\n  - "libs/*"\n  - tools\n');
    write("libs/ui/package.json", '{"name":"ui","exports":{"./parts/*.ts":"./src/*.ts"}}');
    write("libs/app/package.json", '{"name":"app"}');
    write("libs/app/src/a.ts", 'import "ui/parts/a.ts"; import("ui/src/a.ts"); require("ui");');
    write("libs/empty/readme.md", "pas un paquet");

    expect(findDeepImports(dir).map((found) => found.specifier)).toEqual(["ui/src/a.ts"]);
  });

  it("le dépôt réel ne contient aucun import profond", () => {
    expect(main(repoRoot)).toBe(0);
  });
});
