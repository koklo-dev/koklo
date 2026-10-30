const MAX_BASE_LENGTH = 40;
const FALLBACK = "organisation";

interface SlugOptions {
  /** Borne de la longueur, pour laisser place à un suffixe (défaut 40). */
  maxLength?: number;
  /** Valeur de repli si le nom ne donne aucun slug exploitable (défaut `organisation`). */
  fallback?: string;
}

/** Slug ASCII `[a-z0-9-]` dérivé d'un nom (accents retirés), borné pour laisser place à un suffixe. */
export function slugify(name: string, options: SlugOptions = {}): string {
  const { maxLength = MAX_BASE_LENGTH, fallback = FALLBACK } = options;
  const slug = name
    .normalize("NFD")
    .replaceAll(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replaceAll(/-+$/g, "");
  return slug.length >= 2 ? slug : fallback;
}

/** Premier de `base`, `base-2`, `base-3`… absent de `taken`. */
export function firstFreeSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) {
    return base;
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}
