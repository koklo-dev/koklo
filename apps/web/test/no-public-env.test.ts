import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx|mjs|js|json)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

// Artefacts hors production (cache, dev) et copies du runtime Next.js dans standalone.
const IGNORED_BUILD_PATH = /\/(cache|dev)\/|\/node_modules\//;
// Lectures de repli de better-auth (jamais définies par koklo) embarquées dans le bundle client.
const THIRD_PARTY_FALLBACKS =
  /NEXT_PUBLIC_(BETTER_AUTH_URL|AUTH_URL|BETTER_AUTH_SECRET|AUTH_SECRET)/g;

describe("config runtime sans NEXT_PUBLIC_*", () => {
  it("le code source existe (src/) et ne contient aucune occurrence de NEXT_PUBLIC_", () => {
    const sources = files(join(webRoot, "src"));
    expect(sources.length).toBeGreaterThan(0);
    const offenders = sources.filter((file) => readFileSync(file, "utf8").includes("NEXT_PUBLIC_"));
    expect(offenders).toEqual([]);
  });

  it("le build .next, s'il existe, ne contient aucune occurrence de NEXT_PUBLIC_", () => {
    let built: string[] = [];
    try {
      built = files(join(webRoot, ".next")).filter((file) => !IGNORED_BUILD_PATH.test(file));
    } catch {
      return; // pas de build local : vérifié par la CI après `pnpm build`
    }
    const offenders = built.filter((file) =>
      readFileSync(file, "utf8").replace(THIRD_PARTY_FALLBACKS, "").includes("NEXT_PUBLIC_"),
    );
    expect(offenders).toEqual([]);
  });
});
