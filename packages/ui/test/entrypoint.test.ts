import { readFileSync } from "node:fs";
import { extname, relative } from "node:path";
import { describe, expect, it } from "vitest";
import * as ui from "../src/index.ts";
import { repoRoot, uiRoot, walk } from "./helpers/paths.ts";

const pkg = JSON.parse(readFileSync(`${uiRoot}/package.json`, "utf8")) as {
  exports: Record<string, unknown>;
};

const SHADCN_ROOTS = [
  "Table",
  "Badge",
  "Tabs",
  "Button",
  "Sheet",
  "Card",
  "Accordion",
  "Alert",
  "Select",
  "Popover",
  "ResizablePanelGroup",
  "Avatar",
  "DropdownMenu",
] as const;

const SCAN_IGNORED = [
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  ".git",
  ".worktrees",
  ".workflow",
  "coverage",
];

const SUBCOMPONENTS = [
  "TableRow",
  "TabsTrigger",
  "SheetContent",
  "CardHeader",
  "AccordionItem",
  "AlertDescription",
  "SelectTrigger",
  "PopoverContent",
  "ResizableHandle",
  "AvatarFallback",
  "DropdownMenuItem",
];

describe("CA4 : point d'entrée unique de @koklo/ui", () => {
  it("exports de package.json : pas de sous-chemin composants/lib/icônes ni joker", () => {
    const keys = Object.keys(pkg.exports);
    expect(keys).toContain(".");
    const forbidden = keys.filter(
      (k) => k.includes("*") || /^\.\/(components|lib|icons|src|dist)/.test(k),
    );
    expect(forbidden).toEqual([]);
    for (const key of keys) {
      if (key !== ".") expect(key).toMatch(/\.css$/);
    }
  });

  it("aucun import @koklo/ui/... hors feuilles CSS exportées", () => {
    const allowed = new Set(Object.keys(pkg.exports).filter((k) => k !== "."));
    const importRe = /["'`]@koklo\/ui\/([^"'`]+)["'`]/g;
    const sources = walk(repoRoot, SCAN_IGNORED)
      .filter((f) => [".ts", ".tsx", ".css", ".mjs"].includes(extname(f)))
      .filter((f) => f !== import.meta.filename);
    const offenders: string[] = [];
    for (const file of sources) {
      for (const m of readFileSync(file, "utf8").matchAll(importRe)) {
        if (!allowed.has(`./${m[1]}`))
          offenders.push(`${relative(repoRoot, file)} -> @koklo/ui/${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("src/index.ts exporte Icon, StatusBadge, Button et IconButton", () => {
    for (const name of ["Icon", "StatusBadge", "Button", "IconButton", "cn"]) {
      expect(ui, name).toHaveProperty(name);
    }
  });

  it.each(SHADCN_ROOTS)("src/index.ts exporte le composant shadcn %s", (name) => {
    expect(ui).toHaveProperty(name);
  });

  it("exporte les sous-composants principaux des composants composés", () => {
    for (const name of SUBCOMPONENTS) {
      expect(ui, name).toHaveProperty(name);
    }
  });
});
