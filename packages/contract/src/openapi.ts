import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { contract } from "./contract.ts";
import { CONTRACT_VERSION } from "./version.ts";

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, entry]) => [key, sortKeys(entry)]),
    );
  }
  return value;
};

/** Le générateur lit les statuts d'erreur dans une table à part : on la dérive du contrat. */
const errorStatusMap = Object.fromEntries(
  [contract.health, contract.project.list].flatMap((procedure) =>
    Object.entries(procedure["~orpc"].errorMap).map(([code, item]) => [code, item.status]),
  ),
);

/** Document OpenAPI du contrat : pur, sans I/O, clés triées pour une sortie déterministe. */
export const generateOpenApi = async (): Promise<Record<string, unknown>> => {
  const generator = new OpenAPIGenerator({ converters: [new ZodToJsonSchemaConverter()] });
  const document = await generator.generate(contract, {
    version: "3.1.0",
    errorStatusMap,
    base: { info: { title: "Koklo API", version: CONTRACT_VERSION } },
  });
  return sortKeys(document) as Record<string, unknown>;
};
