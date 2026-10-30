import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Issue, SpecFile } from "../src/index.ts";

const validDir = resolve(import.meta.dirname, "fixtures/valid");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

/** La spec valide complète (mini-spec Civinat de l'annexe A), lue du disque, triée par chemin. */
export function validFiles(): SpecFile[] {
  return walk(validDir)
    .map((file) => ({
      path: relative(validDir, file).split("\\").join("/"),
      content: readFileSync(file, "utf8"),
    }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
}

export function validFile(path: string): string {
  const found = validFiles().find((f) => f.path === path);
  if (!found) throw new Error(`fixture introuvable : ${path}`);
  return found.content;
}

/**
 * Variante de la spec valide : `changes[path] = contenu` ajoute ou remplace un fichier,
 * `null` le supprime. Un seul défaut par fixture invalide.
 */
export function withFiles(changes: Record<string, string | null>): SpecFile[] {
  const byPath = new Map(validFiles().map((f) => [f.path, f.content]));
  for (const [path, content] of Object.entries(changes)) {
    if (content === null) byPath.delete(path);
    else byPath.set(path, content);
  }
  return [...byPath].map(([path, content]) => ({ path, content }));
}

/** Remplace `from` par `to` dans une fixture valide (échoue si `from` est absent : pas de patch muet). */
export function patch(path: string, from: string, to: string): string {
  const content = validFile(path);
  if (!content.includes(from)) throw new Error(`motif absent de ${path} : ${from}`);
  return content.replace(from, to);
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const codes = (issues: readonly Issue[]): string[] => issues.map((i) => i.code);

/** Générateur pseudo-aléatoire déterministe (LCG), graine fixe : aucun `Math.random` dans les tests. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
