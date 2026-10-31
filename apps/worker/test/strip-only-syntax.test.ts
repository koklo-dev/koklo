import { readdirSync, readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `pnpm dev` lance `node --watch src/main.ts` : Node 24 n'efface que les types
 * (mode strip-only) et refuse tout TypeScript qui génère du code (paramètres de
 * constructeur, enum, namespace, `import =`). Cette garde charge chaque source
 * avec le même mode que le runtime, pour que le démarrage ne casse pas en dev.
 */
const srcDir = new URL("../src", import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });
}

describe("syntaxe TypeScript du worker en mode strip-only", () => {
  it("découvre des sources à vérifier", () => {
    expect(sources(srcDir).length).toBeGreaterThan(10);
  });

  it.each(sources(srcDir).map((p) => [p.slice(srcDir.length + 1), p]))(
    "%s s'exécute sans transformation",
    (_name, path) => {
      expect(() =>
        stripTypeScriptTypes(readFileSync(path, "utf8"), { mode: "strip" }),
      ).not.toThrow();
    },
  );
});
