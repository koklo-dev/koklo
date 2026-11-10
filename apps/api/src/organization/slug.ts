export { slugify } from "@koklo/domain";

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
