import { type TableV2, TableV2Schema } from "../entities/index.ts";
import { loadYaml } from "./yaml.ts";
import { type EntityParse, parseWithSchema, rawId } from "./zod-issues.ts";
import { applyZoneAlias } from "./zone-alias.ts";

/** Table au format v2 `data/tables/<slug>.yaml` (alias `domaine` lu comme `zone`). Ne lève jamais. */
export function parseTableFile(path: string, content: string): EntityParse<TableV2> {
  const loaded = loadYaml(path, content);
  if (!loaded.ok) return loaded;
  const id = rawId(loaded.data);
  const aliased = applyZoneAlias(path, loaded.data, id);
  if (!aliased.ok) return aliased;
  return parseWithSchema(TableV2Schema, path, aliased.data, id);
}
