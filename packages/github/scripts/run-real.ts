/**
 * Point d'entrée de `pnpm --filter @koklo/github test:real` : refuse de démarrer tant qu'une
 * variable `KOKLO_GH_*` manque (jamais « sauté = vert »), puis lance les tests réels.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { missingRealEnv } from "./real-env.ts";

const packageDir = resolve(import.meta.dirname, "..");

function main(): number {
  const missing = missingRealEnv(process.env);
  if (missing.length > 0) {
    process.stderr.write(
      `test:real refusé : variables d'environnement manquantes :\n${missing.map((name) => `  - ${name}`).join("\n")}\n` +
        "Voir docs/quality-and-operations.md (procédure des tests réels GitHub).\n",
    );
    return 1;
  }
  const run = spawnSync("pnpm", ["exec", "vitest", "run", "--config", "vitest.real.config.ts"], {
    cwd: packageDir,
    stdio: "inherit",
    env: process.env,
  });
  return run.status ?? 1;
}

process.exitCode = main();
