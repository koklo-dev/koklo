import { readFileSync } from "node:fs";
import { extname, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot, uiRoot, walk } from "./helpers/paths.ts";

const IGNORED = [
  "node_modules",
  "dist",
  "coverage",
  ".next",
  ".turbo",
  ".git",
  ".worktrees",
  ".workflow",
  "test-results",
];
const SCANNED = [".ts", ".tsx", ".css", ".json", ".mjs", ".js"];
// Construit dynamiquement pour que ce fichier ne se détecte pas lui-même.
const forbidden = ["lucide", "react"].join("-");
const thisFile = import.meta.filename;

const files = walk(repoRoot, IGNORED).filter(
  (f) => SCANNED.includes(extname(f)) && f !== thisFile && !f.endsWith("pnpm-lock.yaml"),
);

describe("CA1 : aucun import de lucide-react", () => {
  it("scanne bien des sources du workspace (garde-fou du scan)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("aucun fichier source du workspace ne mentionne lucide-react", () => {
    const offenders = files
      .filter((f) => readFileSync(f, "utf8").includes(forbidden))
      .map((f) => relative(repoRoot, f));
    expect(offenders).toEqual([]);
  });

  it("aucun package.json ne déclare lucide-react (dependencies, dev, peer)", () => {
    const offenders = files
      .filter((f) => f.endsWith("package.json"))
      .filter((f) => {
        const pkg = JSON.parse(readFileSync(f, "utf8"));
        return [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies].some(
          (deps) => deps && forbidden in deps,
        );
      })
      .map((f) => relative(repoRoot, f));
    expect(offenders).toEqual([]);
  });

  it("components.json n'utilise plus lucide comme iconLibrary", () => {
    const cfg = JSON.parse(readFileSync(`${uiRoot}/components.json`, "utf8"));
    expect(cfg.iconLibrary).not.toBe("lucide");
  });
});
