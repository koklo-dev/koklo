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

type ErrorMap = Record<string, { status: number }>;
type ProcedureNode = { "~orpc": { errorMap: ErrorMap } };

/** Procédures du routeur, quelle que soit la profondeur : une nouvelle route est prise en compte sans liste à la main. */
const collectErrorMaps = (node: object): ErrorMap[] =>
  "~orpc" in node
    ? [(node as ProcedureNode)["~orpc"].errorMap]
    : Object.values(node).flatMap(collectErrorMaps);

/** Statut HTTP de chaque code d'erreur du contrat : le générateur OpenAPI et le serveur le lisent ici. */
export const errorStatusMap: Record<string, number> = Object.fromEntries(
  collectErrorMaps(contract).flatMap((errorMap) =>
    Object.entries(errorMap).map(([code, item]) => [code, item.status]),
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
