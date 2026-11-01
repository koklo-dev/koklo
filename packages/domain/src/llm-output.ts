declare const unvalidatedBrand: unique symbol;
declare const validatedBrand: unique symbol;

/** Sortie brute d'un modèle : jamais fiable, jamais utilisable telle quelle. */
export type Unvalidated<T> = { readonly [unvalidatedBrand]: T };

/** Sortie validée : une proposition, jamais une décision. */
export type Validated<T> = {
  readonly [validatedBrand]: true;
  readonly status: "proposal";
  readonly value: T;
};

/** Marque une valeur brute comme non validée (produit par les adaptateurs). */
export const unvalidated = <T>(_raw: T): Unvalidated<T> => {
  throw new Error("non implémenté");
};

/** Seul chemin de `Unvalidated` à `Validated`. */
export const validateLlmOutput = <T>(
  _output: Unvalidated<unknown>,
  _parse: (raw: unknown) => T,
): Validated<T> => {
  throw new Error("non implémenté");
};
