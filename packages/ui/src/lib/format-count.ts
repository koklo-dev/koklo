/** Nom d'un élément de liste, au singulier (0 et 1) et au pluriel, avec son genre pour le participe « chargé(e) ». */
export interface CountNoun {
  one: string;
  other: string;
  /** Masculin : « chargés ». Féminin par défaut (« fonctionnalités chargées »). */
  masculine?: boolean;
}

/** Entier avec espace insécable comme séparateur de milliers (« 1 000 »), identique sur toutes les machines. */
export function formatCount(value: number): string {
  return String(Math.trunc(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Le français met le singulier à 0 et à 1. */
export function nounFor(count: number, noun: CountNoun): string {
  return count >= 2 ? noun.other : noun.one;
}

export function loadedWord(count: number, noun: CountNoun): string {
  const base = noun.masculine ? "chargé" : "chargée";
  return count >= 2 ? `${base}s` : base;
}
