import { LlmInvalidOutputError } from "./llm-errors.ts";

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
export const unvalidated = <T>(raw: T): Unvalidated<T> => raw as unknown as Unvalidated<T>;

/** Seul chemin de `Unvalidated` à `Validated` ; l'échec ne reprend ni la sortie ni le message de `parse`. */
export const validateLlmOutput = <T>(
  output: Unvalidated<unknown>,
  parse: (raw: unknown) => T,
): Validated<T> => {
  let value: T;
  try {
    value = parse(output as unknown);
  } catch {
    throw new LlmInvalidOutputError("La sortie du modèle ne respecte pas la forme attendue");
  }
  return Object.freeze({ status: "proposal", value }) as unknown as Validated<T>;
};

/** Garde statique : vrai seulement pour une proposition produite par `validateLlmOutput`. */
export const isValidated = (_value: unknown): _value is Validated<unknown> => {
  throw new Error("non implémenté");
};
