import { runImportSprints } from "./import-sprints.ts";

/** Point d'entrée du script `import:sprints` : `node dist/cli/import-sprints.main.js <répertoire> …`. */
runImportSprints(process.argv.slice(2), {
  env: process.env,
  today: () => new Date().toISOString().slice(0, 10),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
})
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
