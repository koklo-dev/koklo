import { z } from "zod";
import {
  BusinessRuleSchema,
  EndpointSchema,
  FeatureSchema,
  ProjectManifestSchema,
  RelationSchema,
  RolesFileSchema,
  ScreenSchema,
  TableSchema,
  TestScenarioSchema,
} from "./entities/index.ts";

const BASE = "https://koklo.dev/schemas/spec/v1";

const entities = {
  endpoint: EndpointSchema,
  feature: FeatureSchema,
  project: ProjectManifestSchema,
  relation: RelationSchema,
  roles: RolesFileSchema,
  rule: BusinessRuleSchema,
  screen: ScreenSchema,
  table: TableSchema,
  "test-scenario": TestScenarioSchema,
} as const;

export type SchemaName = keyof typeof entities;

function generate(name: SchemaName): Record<string, unknown> {
  const schema = z.toJSONSchema(entities[name], { target: "draft-2020-12", io: "input" });
  return { ...schema, $id: `${BASE}/${name}.schema.json` };
}

/** JSON Schema 2020-12 de chaque entité, générés depuis Zod (aucune dérive possible). */
export const jsonSchemas = Object.fromEntries(
  (Object.keys(entities) as SchemaName[]).map((name) => [name, generate(name)]),
) as Record<SchemaName, Record<string, unknown>>;
