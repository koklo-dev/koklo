import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TK-45a : `raiseCounterTo` vit dans `@koklo/db` (le worker en a besoin). L'API la réimporte de
 * là : plus aucune définition locale dans `tracker/counters.ts` (pas de duplication), et les deux
 * dépôts qui la consomment l'importent depuis `@koklo/db`. `nextCounterValue` reste local.
 */
const src = (path: string) => readFileSync(resolve(import.meta.dirname, "../src", path), "utf8");

describe("TK-45a raiseCounterTo n'est plus défini dans l'API", () => {
  it("tracker/counters.ts ne définit ni n'exporte raiseCounterTo, et garde nextCounterValue", () => {
    const counters = src("tracker/counters.ts");
    expect(counters).not.toMatch(/raiseCounterTo/);
    expect(counters).toMatch(/export async function nextCounterValue/);
  });

  it.each(["ticket/prisma-ticket.repository.ts", "sprint/prisma-sprint.repository.ts"])(
    "%s importe raiseCounterTo depuis @koklo/db",
    (file) => {
      const source = src(file);
      expect(source).toMatch(/import\s*\{[^}]*\braiseCounterTo\b[^}]*\}\s*from\s*"@koklo\/db"/);
      expect(source).not.toMatch(
        /import\s*\{[^}]*\braiseCounterTo\b[^}]*\}\s*from\s*"\.\.\/tracker\/counters\.ts"/,
      );
    },
  );
});
