import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

const candidates = [
  path.join(repoRoot, "apps/desktop/src-tauri/target/debug/koklo-desktop"),
  path.join(repoRoot, "target/debug/koklo-desktop"),
];

export async function resolveAppBinary() {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    [
      "Unable to find the built Koklo desktop binary.",
      "Looked in:",
      ...candidates.map((candidate) => `- ${candidate}`),
      "Run `pnpm --filter @koklo/desktop tauri build --debug --no-bundle` first.",
    ].join("\n"),
  );
}
