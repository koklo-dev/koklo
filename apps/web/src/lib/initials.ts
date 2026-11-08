/** Initiales (deux au plus) d'un nom, en capitales : « Awa Koné » donne « AK ». */
export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
