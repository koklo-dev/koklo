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

const proposals = new WeakSet<object>();
const noop = (): void => undefined;

/** Vrai pour un thenable ; une vraie promesse est neutralisée (aucun rejet non géré). */
const isThenable = (value: unknown): boolean => {
  try {
    if (value instanceof Promise) {
      Promise.prototype.then.call(value, noop, noop);
      return true;
    }
    const candidate = value as { then?: unknown } | null;
    return (
      (typeof candidate === "object" || typeof candidate === "function") &&
      candidate !== null &&
      typeof candidate.then === "function"
    );
  } catch {
    return true;
  }
};

/**
 * Seul chemin de `Unvalidated` à `Validated` ; l'échec ne reprend ni la sortie ni le message de
 * `parse`. Un `parse` asynchrone ou thenable est refusé sans appeler `then`.
 */
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
  if (isThenable(value)) {
    throw new LlmInvalidOutputError("Le validateur doit être synchrone");
  }
  const proposal = Object.freeze({ status: "proposal", value }) as unknown as Validated<T>;
  proposals.add(proposal);
  return proposal;
};

/** Garde d'exécution : vrai seulement pour une proposition produite par `validateLlmOutput`. */
export const isValidated = (value: unknown): value is Validated<unknown> =>
  typeof value === "object" && value !== null && proposals.has(value);
