import { DuplicateTicketKeyError, InvalidTicketKeyError } from "./errors.ts";

const KEY_PATTERN = /^TK-[1-9][0-9]*$/;

const isPositiveSafeInteger = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 1;

export const formatTicketKey = (n: number): string => {
  if (!isPositiveSafeInteger(n)) throw new InvalidTicketKeyError(n);
  return `TK-${n}`;
};

export const parseTicketKey = (value: unknown): number => {
  if (typeof value !== "string" || !KEY_PATTERN.test(value)) {
    throw new InvalidTicketKeyError(value);
  }
  const n = Number(value.slice(3));
  if (!Number.isSafeInteger(n)) throw new InvalidTicketKeyError(value);
  return n;
};

/** Clé suivante à partir du compteur du projet (le compteur transactionnel est à TK-28). */
export const nextTicketKey = (counter: number): string => {
  if (typeof counter !== "number" || !Number.isSafeInteger(counter) || counter < 0) {
    throw new InvalidTicketKeyError(counter);
  }
  return formatTicketKey(counter + 1);
};

export const assertUniqueKeys = (keys: readonly string[]): void => {
  const seen = new Set<string>();
  for (const key of keys) {
    parseTicketKey(key);
    if (seen.has(key)) throw new DuplicateTicketKeyError(key);
    seen.add(key);
  }
};
