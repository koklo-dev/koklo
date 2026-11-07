import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Le nom d'un fournisseur d'IA n'apparaît que sur l'écran des fournisseurs (B15, DESIGN.md §5.4) : ni dans le bloc
 * d'envoi, ni dans les libellés partagés, ni dans les autres composants.
 */
const NAMES = /Anthropic|OpenAI|OpenRouter|Mistral|Gemini|Claude/;
const SRC = join(import.meta.dirname, "../src");
const OWNERS = new Set([
  "components/ai-settings-page.tsx",
  "components/ai-providers-list.tsx",
  "components/ai-provider-add.tsx",
  "components/ai-provider-key.tsx",
  "components/ai-usage-models.tsx",
  "components/ai-fallback-switch.tsx",
  "components/ai-consumption.tsx",
  "lib/ai-settings-labels.ts",
  "lib/ai-provider-names.ts",
  "lib/use-ai-providers.ts",
]);

function sources(dir: string, base = ""): string[] {
  return readdirSync(join(dir, base), { withFileTypes: true }).flatMap((entry) => {
    const path = join(base, entry.name);
    if (entry.isDirectory()) return sources(dir, path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("noms de fournisseurs", () => {
  it("ai-send-policy.tsx et les libellés partagés n'en citent aucun", () => {
    for (const file of [
      "components/ai-send-policy.tsx",
      "components/ai-error-notice.tsx",
      "lib/ai-errors.ts",
    ]) {
      expect(readFileSync(join(SRC, file), "utf8"), file).not.toMatch(NAMES);
    }
  });
  it("aucun autre fichier de src n'en cite, hors les fichiers de l'écran", () => {
    const offenders = sources(SRC).filter(
      (file) => !OWNERS.has(file) && NAMES.test(readFileSync(join(SRC, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
