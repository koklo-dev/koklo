/** Nombre de teintes de la tuile d'un projet (`--hue-1..5`). */
export const PROJECT_TILE_HUES = 5;

export type ProjectColorKey = 1 | 2 | 3 | 4 | 5;

export interface ProjectTile {
  initials: string;
  colorKey: ProjectColorKey;
}

const WORD = /[\p{L}\p{N}]+/gu;

/** Initiales : première lettre des deux premiers mots, en majuscules ; un seul mot donne ses deux premières lettres. */
export function projectInitialsOf(name: string): string {
  const words = name.match(WORD) ?? [];
  const letters =
    words.length >= 2
      ? words.slice(0, 2).map((word) => [...word][0] ?? "")
      : [...(words[0] ?? "")].slice(0, 2);
  const initials = letters.join("").toLocaleUpperCase("fr");
  return initials === "" ? "?" : initials;
}

/** Hachage stable (FNV-1a 32 bits) : une même clé donne toujours la même teinte, sur toute machine. */
function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Tuile d'un projet : initiales du nom et teinte 1..5 dérivée de l'identifiant (jamais du nom, qui peut changer). */
export function projectTileOf(id: string, name: string): ProjectTile {
  return {
    initials: projectInitialsOf(name),
    colorKey: ((stableHash(id) % PROJECT_TILE_HUES) + 1) as ProjectColorKey,
  };
}
