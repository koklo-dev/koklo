import { runRotateEncryptionKey } from "./rotate-encryption-key.ts";

/** Point d'entrée du script `rotate:encryption-key` : `node dist/cli/rotate-encryption-key.main.js [--dry-run] [--json]`. */
runRotateEncryptionKey(process.argv.slice(2), {
  env: process.env,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
})
  .then((code) => {
    process.exitCode = code;
  })
  .catch(() => {
    console.error("Échec technique de la rotation");
    process.exitCode = 1;
  });
