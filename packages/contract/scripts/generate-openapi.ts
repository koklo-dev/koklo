import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateOpenApi } from "../src/openapi.ts";
import { type OpenApiVersions, recordVersion } from "../src/versions.ts";

const root = resolve(import.meta.dirname, "..");
const document = await generateOpenApi();
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const versionsPath = resolve(root, "openapi/versions.json");
let versions: OpenApiVersions = {};
try {
  versions = JSON.parse(readFileSync(versionsPath, "utf8"));
} catch {
  // premier lancement : le fichier n'existe pas encore
}
const next = recordVersion(versions, version, document);

writeFileSync(resolve(root, "openapi/openapi.json"), `${JSON.stringify(document, null, 2)}\n`);
writeFileSync(versionsPath, `${JSON.stringify(next, null, 2)}\n`);
