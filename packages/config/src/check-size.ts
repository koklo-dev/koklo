import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FILE_LINES_RULE, isExpired, loadWaivers, type Waiver } from "./waivers.ts";

export const SOURCE_LIMIT = 300;
export const TEST_LIMIT = 500;

export interface Violation {
  file: string;
  kind: "source" | "test";
  lines: number;
  limit: number;
  reason: "too-long" | "waiver-expired";
  message: string;
}

export interface CheckSizeOptions {
  root: string;
  today?: Date;
}

const SOURCE_EXT = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const TEST_FILE = /\.(?:test|spec)\./;
const GENERATED_FILE = /\.(?:generated|gen)\./;
const MARKER = /@generated|DO NOT EDIT/;
const SKIPPED_DIRS = new Set([
  "node_modules",
  ".git",
  ".worktrees",
  ".workflow",
  ".turbo",
  "dist",
  ".next",
  "coverage",
  "migrations",
  "generated",
]);
const TEST_DIRS = new Set(["test", "tests", "__tests__", "e2e"]);

async function walk(root: string, dir = ""): Promise<string[]> {
  const entries = await readdir(join(root, dir), { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const rel = dir === "" ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) {
        found.push(...(await walk(root, rel)));
      }
    } else if (entry.isFile() && SOURCE_EXT.test(entry.name) && !GENERATED_FILE.test(entry.name)) {
      found.push(rel);
    }
  }
  return found;
}

function isTestFile(rel: string): boolean {
  const segments = rel.split("/");
  return TEST_FILE.test(rel) || segments.slice(0, -1).some((segment) => TEST_DIRS.has(segment));
}

function countLines(content: string): number {
  const newlines = content.split("\n").length - 1;
  return content !== "" && !content.endsWith("\n") ? newlines + 1 : newlines;
}

function hasGeneratedHeader(content: string): boolean {
  return content.split("\n", 5).some((line) => MARKER.test(line));
}

function formatMessage(rel: string, lines: number, limit: number, expired?: Waiver): string {
  const base = `${rel} : ${lines} lignes (limite ${limit})`;
  return expired ? `${base} ; dérogation expirée le ${expired.expires} (${expired.author})` : base;
}

function evaluate(rel: string, content: string, waivers: Waiver[], today: Date): Violation | null {
  const kind = isTestFile(rel) ? "test" : "source";
  const limit = kind === "test" ? TEST_LIMIT : SOURCE_LIMIT;
  const lines = countLines(content);
  if (lines <= limit || hasGeneratedHeader(content)) {
    return null;
  }
  const matching = waivers.filter((w) => w.file === rel && w.rule === FILE_LINES_RULE);
  if (matching.some((w) => !isExpired(w, today))) {
    return null;
  }
  const expired = matching[0];
  const reason = expired ? "waiver-expired" : "too-long";
  const message = formatMessage(rel, lines, limit, expired);
  return { file: rel, kind, lines, limit, reason, message };
}

/** Retourne les violations de taille de fichier ; lève si `waivers.yaml` est invalide. */
export async function checkSize(options: CheckSizeOptions): Promise<Violation[]> {
  const today = options.today ?? new Date();
  const waivers = await loadWaivers(options.root);
  const violations: Violation[] = [];
  for (const rel of (await walk(options.root)).sort()) {
    const content = await readFile(join(options.root, rel), "utf8");
    const violation = evaluate(rel, content, waivers, today);
    if (violation) {
      violations.push(violation);
    }
  }
  return violations;
}

/** Point d'entrée CLI : écrit les violations sur stderr et retourne le code de sortie. */
export async function main(rootArg?: string): Promise<number> {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(rootArg ?? join(here, "..", "..", ".."));
  try {
    const violations = await checkSize({ root });
    for (const violation of violations) {
      console.error(`check:size ${violation.message}`);
    }
    return violations.length > 0 ? 1 : 0;
  } catch (error) {
    console.error(`check:size ${(error as Error).message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv[2]);
}
