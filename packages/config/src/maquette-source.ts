import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Extrait le code lisible d'une maquette HTML de `docs/refonte/maquettes/` : le gabarit (balisage,
 * styles, états) et la classe de logique, sans les bibliothèques embarquées en base64. C'est la
 * référence qu'un agent lit avant de coder ou de relire un écran (la maquette fait foi).
 */

const EMBEDDED_SCRIPT = /<script[^>]*\bsrc="data:[^"]*"[^>]*>\s*<\/script>/g;
const INLINE_SCRIPT = /<script([^>]*)>([\s\S]*?)<\/script>/g;
const LOGIC_TYPE = /type="text\/x-dc"/;

export interface MaquetteSource {
  readonly title: string;
  readonly template: string;
  readonly logic: string;
}

export function extractMaquette(html: string): MaquetteSource {
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1]?.trim() ?? "";
  const logic: string[] = [];
  const template = html
    .replace(EMBEDDED_SCRIPT, "")
    .replace(INLINE_SCRIPT, (_all, attrs: string, body: string) => {
      if (LOGIC_TYPE.test(attrs)) logic.push(body.trim());
      return "";
    });
  return { title, template: template.replace(/\n{3,}/g, "\n\n").trim(), logic: logic.join("\n\n") };
}

/** Rend la maquette en un texte unique : titre, gabarit, puis logique. */
export function formatMaquette(name: string, source: MaquetteSource): string {
  return [
    `# Maquette ${name} — ${source.title}`,
    "",
    "## Gabarit (balisage, styles, états)",
    "",
    source.template,
    "",
    "## Logique (états, données, variantes)",
    "",
    source.logic || "(aucune)",
    "",
  ].join("\n");
}

/** Trouve le fichier d'une maquette par son numéro (« 24 ») ou une partie de son nom (« Reglages »). */
export function findMaquette(dir: string, query: string): string | undefined {
  const files = readdirSync(dir).filter((f) => f.endsWith(".html") && f !== "index.html");
  const byNumber = files.find((f) => f.startsWith(`${query.padStart(2, "0")}-`));
  return byNumber ?? files.find((f) => f.toLowerCase().includes(query.toLowerCase()));
}

export function main(root: string, query: string | undefined): number {
  const dir = resolve(root, "docs/refonte/maquettes");
  if (!query) {
    console.error("usage : pnpm maquette <numéro ou nom>, par exemple « pnpm maquette 24 »");
    return 1;
  }
  const file = findMaquette(dir, query);
  if (!file) {
    console.error(`aucune maquette ne correspond à « ${query} » dans ${dir}`);
    return 1;
  }
  process.stdout.write(
    formatMaquette(file, extractMaquette(readFileSync(resolve(dir, file), "utf8"))),
  );
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.env.INIT_CWD ?? process.cwd(), process.argv[2]);
}
