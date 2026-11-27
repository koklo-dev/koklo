import { stringify } from "yaml";
import type { z } from "zod";
import { toPointer } from "../parse/zod-issues.ts";
import type { EmitError } from "./errors.ts";

/** Liste omise quand elle est vide : un fichier minimal reste lisible (`undefined` n'est pas écrit). */
export const listIf = <T>(items: readonly T[]): T[] | undefined =>
  items.length === 0 ? undefined : [...items];

/** Table de champs omise quand elle est vide, valeurs remises dans la forme canonique. */
export const recordIf = <T, U>(
  record: Readonly<Record<string, T>>,
  shape: (value: T) => U,
): Record<string, U> | undefined => {
  const entries = Object.entries(record);
  return entries.length === 0
    ? undefined
    : Object.fromEntries(entries.map(([key, value]) => [key, shape(value)]));
};

/**
 * Valeur revalidée puis écrite en YAML canonique : `shape` fixe l'ordre des clés, une valeur `undefined` est omise.
 * Ne lève que l'erreur d'émission donnée, avec le pointeur de la première valeur refusée.
 */
export function emitYaml<S extends z.ZodType>(
  schema: S,
  value: unknown,
  failure: { new (message: string, path: string): EmitError; readonly fallback: string },
  shape: (checked: z.output<S>) => object,
): string {
  const checked = schema.safeParse(value);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    throw new failure(issue?.message ?? failure.fallback, toPointer(issue?.path ?? []));
  }
  return stringify(shape(checked.data), { lineWidth: 0 });
}
