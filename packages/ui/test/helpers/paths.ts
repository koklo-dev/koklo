import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** Racine du paquet @koklo/ui. */
export const uiRoot = resolve(import.meta.dirname, "../..");

/** Racine du dépôt (DESIGN.md est la source de vérité des tokens). */
export const repoRoot = resolve(uiRoot, "../..");

export const designPath = join(repoRoot, "DESIGN.md");

/**
 * Chemins attendus du CSS livré (contrat figé par les tests TK-13) :
 * - theme.css      : `:root` / `.dark`, tokens §2.1 SAUF les valeurs « à confirmer »
 * - tentative.css  : seul fichier déclarant --primary, --ring, --destructive, --destructive-foreground
 * - status.css     : 12 variables --status-*
 * - typography.css : polices (--font-sans, --font-mono) et échelle --text-<rôle>-*
 * - fonts.css      : @font-face / imports Fontsource (auto-hébergés)
 */
export const stylesDir = join(uiRoot, "src/styles");
export const cssPath = {
  theme: join(stylesDir, "theme.css"),
  tentative: join(stylesDir, "tentative.css"),
  status: join(stylesDir, "status.css"),
  typography: join(stylesDir, "typography.css"),
  fonts: join(stylesDir, "fonts.css"),
} as const;

/** Lit un fichier ; échoue explicitement (fichier livré manquant) s'il est absent. */
export function readRequired(path: string): string {
  if (!existsSync(path)) {
    throw new Error(`Fichier attendu absent : ${path}`);
  }
  return readFileSync(path, "utf8");
}

/** Parcourt récursivement un dossier en ignorant les noms exclus. */
export function walk(dir: string, ignored: readonly string[]): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (ignored.includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full, ignored));
    else files.push(full);
  }
  return files;
}
