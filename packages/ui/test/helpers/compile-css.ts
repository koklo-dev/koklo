import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { compile } from "tailwindcss";
import { stylesDir } from "./paths.ts";

const require = createRequire(import.meta.url);

/** Résout un @import comme le ferait un bundler : relatif, sinon paquet npm. */
async function loadStylesheet(id: string, base: string) {
  const path =
    id === "tailwindcss"
      ? require.resolve("tailwindcss/index.css")
      : id.startsWith(".")
        ? join(base, id)
        : require.resolve(id);
  return { path, base: dirname(path), content: readFileSync(path, "utf8") };
}

/** Compile `src/styles/index.css` avec Tailwind, pour les tests unitaires et e2e. */
export async function compileIndexCss(candidates: string[] = []): Promise<string> {
  const compiler = await compile(readFileSync(join(stylesDir, "index.css"), "utf8"), {
    base: stylesDir,
    loadStylesheet,
  });
  return compiler.build(candidates);
}
