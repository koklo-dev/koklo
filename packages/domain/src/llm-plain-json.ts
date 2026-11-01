const MAX_DEPTH = 64;

const isPlainObject = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const check = (value: unknown, ancestors: readonly object[]): boolean => {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value !== "object" || ancestors.length >= MAX_DEPTH || ancestors.includes(value)) {
    return false;
  }
  const path = [...ancestors, value];
  if (Array.isArray(value)) {
    return Array.from(value, (item: unknown) => item).every((item) => check(item, path));
  }
  return isPlainObject(value) && Object.values(value).every((item) => check(item, path));
};

/**
 * Vrai si la valeur ne contient que du JSON : objets simples, tableaux, chaînes, nombres finis,
 * booléens, `null`. Refuse `undefined`, `Map`, `Set`, `Date`, instances de classe, `NaN`, `Infinity`,
 * cycles et profondeur excessive (TK-54a).
 */
export const isPlainJson = (value: unknown): boolean => check(value, []);
