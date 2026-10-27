import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBlocks, merge } from "./helpers/css.ts";
import { cssPath, stylesDir } from "./helpers/paths.ts";

/** Déclarations du bloc `@theme inline { ... }` de index.css (nom -> valeur). */
function themeInline(): Record<string, string> {
  const css = readFileSync(join(stylesDir, "index.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const body = /@theme\s+inline\s*\{([^}]*)\}/.exec(css)?.[1];
  if (!body) throw new Error("Bloc @theme inline introuvable dans index.css");
  const out: Record<string, string> = {};
  for (const decl of body.split(";")) {
    const idx = decl.indexOf(":");
    if (idx > 0) out[decl.slice(0, idx).trim()] = decl.slice(idx + 1).trim();
  }
  return out;
}

const sources = [cssPath.theme, cssPath.tentative, cssPath.status].map(loadBlocks);
const rootVars = merge(...sources.map((b) => b[":root"] ?? {}));
const darkVars = merge(...sources.map((b) => b[".dark"] ?? {}));
const mapping = themeInline();

describe("mappage @theme inline (index.css) cohérent avec les variables CSS", () => {
  it("chaque --color-* / --radius-* référence une variable déclarée dans :root", () => {
    for (const [name, value] of Object.entries(mapping)) {
      const refs = [...value.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1] ?? "");
      expect(refs.length, `${name} sans var()`).toBeGreaterThan(0);
      for (const ref of refs) expect(rootVars, `${name} -> ${ref}`).toHaveProperty([ref]);
    }
  });

  it("chaque variable de couleur (thème, tentative, statut) est exposée à Tailwind", () => {
    const exposed = Object.values(mapping).join(" ");
    for (const v of Object.keys(rootVars).filter((k) => !k.startsWith("--radius"))) {
      expect(exposed, v).toContain(`var(${v})`);
    }
  });

  it("le thème sombre ne redéfinit que des variables déclarées dans :root", () => {
    for (const v of Object.keys(darkVars)) expect(rootVars, v).toHaveProperty([v]);
  });
});
