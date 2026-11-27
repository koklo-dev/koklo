/** Clé de comparaison de deux titres : forme NFKC, espaces repliés, casse ignorée. */
export const titleKey = (title: string): string =>
  title.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
