/** Ordre par unités de code : indépendant de la locale, donc déterministe. */
export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const sortedUnique = (items: Iterable<string>): string[] =>
  [...new Set(items)].sort(compareText);
