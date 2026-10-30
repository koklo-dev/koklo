import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalize, jsonSchemas } from "../src/index.ts";

const dir = resolve(import.meta.dirname, "../schemas");
mkdirSync(dir, { recursive: true });
for (const [name, schema] of Object.entries(jsonSchemas)) {
  writeFileSync(resolve(dir, `${name}.schema.json`), canonicalize(schema), "utf8");
}
console.info(`${Object.keys(jsonSchemas).length} schémas écrits dans ${dir}`);
