import { InvalidInstantError } from "./errors.ts";

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Millisecondes epoch d'un instant ISO-8601 UTC ; le temps est toujours injecté, jamais lu. */
export const parseInstant = (value: unknown): number => {
  if (typeof value !== "string" || !ISO_UTC.test(value)) throw new InvalidInstantError(value);
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new InvalidInstantError(value);
  return ms;
};

export const formatInstant = (ms: number): string => new Date(ms).toISOString();
