import { readFileSync } from "node:fs";
import * as contract from "@koklo/contract";

/** Aides communes aux tests de parité du contrat 0.5.0 (copie en dur + relecture des sources par chemin). */
type Standard = { "~standard": { validate(v: unknown): unknown } };
type Enum = { readonly options: readonly string[] };
export const accepts = (schema: unknown, value: unknown) =>
  ((schema as Standard)["~standard"].validate(value) as { issues?: unknown[] }).issues ===
  undefined;
export const kept = (schema: unknown, value: unknown) => {
  const r = (schema as Standard)["~standard"].validate(value) as {
    issues?: unknown[];
    value?: unknown;
  };
  return r.issues === undefined ? (r.value as Record<string, unknown>) : undefined;
};
export const options = (schema: unknown) => [...(schema as Enum).options].sort();
export const sorted = (values: readonly string[]) => [...values].sort();
export const api = contract as unknown as Record<string, unknown>;

export const read = (rel: string) =>
  readFileSync(new URL(`../../../../${rel}`, import.meta.url), "utf8");
export const literals = (text: string) =>
  [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string);
export const prismaEnum = (name: string): string[] => {
  const match = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(
    read("packages/db/prisma/schema.prisma"),
  );
  if (!match?.[1]) throw new Error(`enum ${name} introuvable dans schema.prisma`);
  return sorted(match[1].split(/\s+/).filter((w) => /^[A-Za-z_]+$/.test(w)));
};
export const zodEnum = (file: string, field: string): string[] => {
  const match = new RegExp(`${field}:\\s*z\\.enum\\(\\[([^\\]]+)\\]\\)`).exec(
    read(`packages/schema/src/entities/${file}`),
  );
  if (!match?.[1]) throw new Error(`z.enum introuvable pour ${field} dans ${file}`);
  return sorted(literals(match[1]));
};

export const errorMap = (route: string) => {
  let node: unknown = contract.contract;
  for (const part of route.split(".")) node = (node as Record<string, unknown>)?.[part];
  return (
    (node as { "~orpc": { errorMap: Record<string, { data?: unknown }> } })?.["~orpc"].errorMap ??
    {}
  );
};
export const inputOf = (route: string) => {
  let node: unknown = contract.contract;
  for (const part of route.split(".")) node = (node as Record<string, unknown>)?.[part];
  return (node as { "~orpc": { inputSchemas: unknown[] } })?.["~orpc"].inputSchemas?.[0];
};
