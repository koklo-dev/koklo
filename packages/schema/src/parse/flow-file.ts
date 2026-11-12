import type { Flow } from "../entities/index.ts";
import { FlowSchema } from "../entities/index.ts";
import { loadYaml } from "./yaml.ts";
import { type EntityParse, parseWithSchema, rawId } from "./zod-issues.ts";

/** Parcours `design/flows/P-<slug>.yaml` (le YAML lit aussi du JSON). Ne lève jamais. */
export function parseFlowFile(path: string, content: string): EntityParse<Flow> {
  const loaded = loadYaml(path, content);
  if (!loaded.ok) return loaded;
  return parseWithSchema(FlowSchema, path, loaded.data, rawId(loaded.data));
}
