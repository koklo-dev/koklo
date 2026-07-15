import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const servicePath = path.join(
  repoRoot,
  "node_modules/.pnpm/@wdio+tauri-service@1.2.0_expect-webdriverio@5.7.0_tsx@4.23.1_webdriverio@9.29.1/node_modules/@wdio/tauri-service/dist/esm/index.js",
);
const nativeUtilsPath = path.join(
  repoRoot,
  "node_modules/.pnpm/@wdio+native-utils@2.4.0_tsx@4.23.1/node_modules/@wdio/native-utils/dist/esm/index.js",
);

const BROKEN_IMPORT = ", waitUntilWindowAvailable, installMockSyncOverride }";
const FIXED_IMPORT = ", waitUntilWindowAvailable }";
const FOCUS_HOOK = "            await ensureActiveWindowFocus(browser, commandName);";
const FOCUS_HOOK_PATCH = `            // Koklo native E2E uses a single Tauri WebDriver window ("main").
            // The upstream auto-focus hook polls plugin:wdio|get_window_states before
            // every find/click/title command; in this app window.__TAURI__.core.invoke
            // is not ready for that direct-eval path, so each command burns 5s and the
            // smoke spec times out despite the DOM being fully interactive.
            return;`;
const SHIM = `
const installMockSyncOverride = () => {
    // Work around a published @wdio/tauri-service import mismatch until upstream fixes it.
};
`;

async function main() {
  let nativeUtilsSource = "";
  try {
    nativeUtilsSource = await readFile(nativeUtilsPath, "utf8");
  } catch {
    return;
  }

  if (nativeUtilsSource.includes("installMockSyncOverride")) {
    return;
  }

  let serviceSource;
  try {
    serviceSource = await readFile(servicePath, "utf8");
  } catch {
    return;
  }

  const needsImportPatch = serviceSource.includes(BROKEN_IMPORT);
  const needsShimPatch = !serviceSource.includes("Work around a published @wdio/tauri-service import mismatch");
  const needsFocusPatch = serviceSource.includes(FOCUS_HOOK);

  if (!needsImportPatch && !needsShimPatch && !needsFocusPatch) {
    return;
  }

  let patched = serviceSource;

  if (needsImportPatch) {
    patched = patched.replace(BROKEN_IMPORT, FIXED_IMPORT);
  }

  if (needsShimPatch) {
    patched = patched.replace(
      "const log$e = createLogger('tauri-service', 'utils');",
      `${SHIM}\nconst log$e = createLogger('tauri-service', 'utils');`,
    );
  }

  if (needsFocusPatch) {
    patched = patched.replace(FOCUS_HOOK, FOCUS_HOOK_PATCH);
  }

  await writeFile(servicePath, patched, "utf8");
  console.log("Patched @wdio/tauri-service for Koklo native E2E");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
