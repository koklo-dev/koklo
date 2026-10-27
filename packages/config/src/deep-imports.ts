import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/** Import profond (`pkg/src/...`) hors des points d'entrée déclarés dans `exports` (CDC §16.4). */
export interface DeepImport {
  file: string;
  specifier: string;
  pkg: string;
}

interface WorkspacePackage {
  name: string;
  dir: string;
  exports: unknown;
}

const SKIPPED_DIRS = new Set(["node_modules", "dist", ".next", ".turbo", "coverage", "fixtures"]);
const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

function subdirectories(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !SKIPPED_DIRS.has(entry.name))
    .map((entry) => join(dir, entry.name));
}

/** Lit les globs `dir/*` ou `dir` de `pnpm-workspace.yaml` (aucune dépendance YAML nécessaire). */
function workspaceDirs(root: string): string[] {
  const yaml = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
  const globs = [...yaml.matchAll(/^\s*-\s*["']?([^"'\s#]+)["']?/gm)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  );
  return globs.flatMap((glob) => {
    const base = join(root, glob.replace(/\/\*$/, ""));
    return glob.endsWith("/*") ? subdirectories(base) : [base];
  });
}

function readPackage(dir: string): WorkspacePackage | undefined {
  try {
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    return typeof manifest.name === "string"
      ? { name: manifest.name, dir, exports: manifest.exports }
      : undefined;
  } catch {
    return undefined;
  }
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : sourceFiles(path);
    return SOURCE_FILE.test(entry.name) ? [path] : [];
  });
}

function exportedSubpaths(exportsField: unknown): string[] {
  if (typeof exportsField !== "object" || exportsField === null) return [];
  return Object.keys(exportsField).filter((key) => key.startsWith("."));
}

function matchesExport(key: string, subpath: string): boolean {
  const star = key.indexOf("*");
  if (star === -1) return key === subpath;
  const [prefix, suffix] = [key.slice(0, star), key.slice(star + 1)];
  return subpath.startsWith(prefix) && subpath.endsWith(suffix);
}

function isDeclared(pkg: WorkspacePackage, specifier: string): boolean {
  const subpath = `.${specifier.slice(pkg.name.length)}`;
  return exportedSubpaths(pkg.exports).some((key) => matchesExport(key, subpath));
}

/** Retourne tous les imports qui contournent les `exports` d'un paquet du workspace. */
export function findDeepImports(root: string): DeepImport[] {
  const packages = workspaceDirs(root)
    .map(readPackage)
    .filter((pkg): pkg is WorkspacePackage => pkg !== undefined);
  const found: DeepImport[] = [];
  for (const { dir } of packages) {
    for (const file of sourceFiles(dir)) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(IMPORT_SPECIFIER)) {
        const specifier = match[1] ?? "";
        const target = packages.find((pkg) => specifier.startsWith(`${pkg.name}/`));
        if (target && !isDeclared(target, specifier)) {
          found.push({ file: relative(root, file), specifier, pkg: target.name });
        }
      }
    }
  }
  return found;
}
