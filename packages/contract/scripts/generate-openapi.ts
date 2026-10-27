import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateOpenApi } from "../src/openapi.ts";

const root = resolve(import.meta.dirname, "..");
const document = await generateOpenApi();
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const versionsPath = resolve(root, "openapi/versions.json");
let versions: Record<string, string> = {};
try {
  versions = JSON.parse(readFileSync(versionsPath, "utf8"));
} catch {
  // premier lancement : le fichier n'existe pas encore
}
versions[version] = createHash("sha256").update(JSON.stringify(document)).digest("hex");

writeFileSync(resolve(root, "openapi/openapi.json"), `${JSON.stringify(document, null, 2)}\n`);
writeFileSync(versionsPath, `${JSON.stringify(versions, null, 2)}\n`);
