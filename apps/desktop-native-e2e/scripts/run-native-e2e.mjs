import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveAppBinary } from "./resolve-app-binary.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "..");
const repoRoot = path.resolve(packageRoot, "../..");

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: false,
      ...options,
    });

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function createWrapper(binaryPath) {
  const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), "koklo-native-e2e-"));
  const wrapperPath = path.join(sandboxRoot, "run-koklo-desktop.sh");
  const kokloHome = path.join(sandboxRoot, "koklo-home");
  const kokloDb = path.join(kokloHome, "koklo.db");
  await mkdir(kokloHome, { recursive: true });

  const script = `#!/usr/bin/env bash
set -euo pipefail
export KOKLO_HOME=${JSON.stringify(kokloHome)}
export KOKLO_DB_PATH=${JSON.stringify(kokloDb)}
mkdir -p "$KOKLO_HOME"
exec ${JSON.stringify(binaryPath)} "$@"
`;

  await writeFile(wrapperPath, script, "utf8");
  await chmod(wrapperPath, 0o755);
  return wrapperPath;
}

async function runWdio(wrapperPath) {
  const wdioArgs = ["exec", "wdio", "run", path.join(packageRoot, "wdio.conf.js")];
  await run("pnpm", wdioArgs, {
    cwd: repoRoot,
    env: {
      ...process.env,
      KOKLO_TAURI_E2E_BINARY: wrapperPath,
    },
  });
}

async function main() {
  await run("pnpm", ["--filter", "@koklo/desktop", "tauri", "build", "--debug", "--no-bundle"]);
  const binaryPath = await resolveAppBinary();
  const wrapperPath = await createWrapper(binaryPath);
  await runWdio(wrapperPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
