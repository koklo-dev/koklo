const MAX_BASE_LENGTH = 40;
const FALLBACK = "organisation";

/** Slug ASCII `[a-z0-9-]` dérivé d'un nom (accents retirés), borné pour laisser place à un suffixe. */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replaceAll(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, MAX_BASE_LENGTH)
    .replaceAll(/-+$/g, "");
  return slug.length >= 2 ? slug : FALLBACK;
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
