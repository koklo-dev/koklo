import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findDeepImports } from "./deep-imports.ts";

/** Code de sortie : 0 si aucun import profond, 1 sinon (messages sur stderr). */
export function main(root: string): number {
  const violations = findDeepImports(root);
  for (const { file, specifier, pkg } of violations) {
    console.error(
      `${file}: import profond "${specifier}" — seuls les exports de ${pkg} sont permis`,
    );
  }
  return violations.length === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(resolve(process.argv[2] ?? process.cwd()));
}
