import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { designStatus, loadBlocks, norm, type StatusKey } from "./helpers/css.ts";
import { cssPath, readRequired, stylesDir, walk } from "./helpers/paths.ts";

const STATUSES: readonly StatusKey[] = ["validated", "pending", "revise"];

describe("CA4 - variables de statut (DESIGN.md §2.2)", () => {
  it.each(STATUSES)("statut %s : 4 variables clair/sombre aux valeurs de DESIGN.md", (status) => {
    const expected = designStatus()[status];
    const blocks = loadBlocks(cssPath.status);
    const light = blocks[":root"] ?? {};
    const dark = blocks[".dark"] ?? {};
    expect(norm(light[`--status-${status}-bg`])).toBe(expected.lightBg);
    expect(norm(light[`--status-${status}-fg`])).toBe(expected.lightFg);
    expect(norm(dark[`--status-${status}-bg`])).toBe(expected.darkBg);
    expect(norm(dark[`--status-${status}-fg`])).toBe(expected.darkFg);
  });

  it("exactement 12 variables --status-*, 6 par thème, sans dérivation de --primary", () => {
    const blocks = loadBlocks(cssPath.status);
    for (const selector of [":root", ".dark"]) {
      const vars = blocks[selector] ?? {};
      expect(Object.keys(vars).sort()).toEqual(
        STATUSES.flatMap((s) => [`--status-${s}-bg`, `--status-${s}-fg`]).sort(),
      );
      for (const value of Object.values(vars)) {
        expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
    expect(readRequired(cssPath.status)).not.toMatch(/--primary|--ring|--accent/);
  });
});

/** Échelle §3 : rôle -> taille (px), graisses admises, interlettrage attendu. */
const SCALE = {
  "page-title": { size: [30, 30], weights: [600], tracking: "-0.025em" },
  "section-title": { size: [22, 24], weights: [600], tracking: "-0.015em" },
  body: { size: [14, 15], weights: [400], tracking: "normal" },
  secondary: { size: [13, 13], weights: [400, 500], tracking: "normal" },
  caption: { size: [12, 12], weights: [500], tracking: "normal" },
  code: { size: [12, 12], weights: [400, 500], tracking: "normal" },
} as const;

describe("CA4 - échelle typographique (DESIGN.md §3)", () => {
  it("déclare les familles --font-sans et --font-mono", () => {
    const root = loadBlocks(cssPath.typography)[":root"] ?? {};
    expect(root["--font-sans"]).toContain("Instrument Sans");
    expect(root["--font-mono"]).toContain("JetBrains Mono");
  });

  it.each(Object.keys(SCALE) as Array<keyof typeof SCALE>)(
    "rôle %s : taille, graisse, interlettrage",
    (role) => {
      const root = loadBlocks(cssPath.typography)[":root"] ?? {};
      const spec = SCALE[role];
      const size = /^(\d+(?:\.\d+)?)px$/.exec(root[`--text-${role}-size`] ?? "")?.[1];
      expect(size, `--text-${role}-size en px`).toBeDefined();
      expect(Number(size)).toBeGreaterThanOrEqual(spec.size[0]);
      expect(Number(size)).toBeLessThanOrEqual(spec.size[1]);
      expect(spec.weights as readonly number[]).toContain(Number(root[`--text-${role}-weight`]));
      expect(norm(root[`--text-${role}-tracking`])).toBe(spec.tracking);
    },
  );

  it("la graisse du code est en JetBrains Mono (--font-mono) et le titre en Instrument Sans", () => {
    const root = loadBlocks(cssPath.typography)[":root"] ?? {};
    expect(norm(root["--text-code-font"])).toBe("var(--font-mono)");
    expect(norm(root["--text-page-title-font"])).toBe("var(--font-sans)");
  });
});

describe("CA4 - valeurs « à confirmer » isolées dans tentative.css", () => {
  const TENTATIVE = ["--destructive", "--destructive-foreground", "--primary", "--ring"];

  it("tentative.css déclare les 4 variables en clair et en sombre", () => {
    const blocks = loadBlocks(cssPath.tentative);
    for (const selector of [":root", ".dark"]) {
      for (const name of TENTATIVE) {
        expect(blocks[selector]?.[name], `${selector} ${name}`).toBeDefined();
      }
    }
  });

  it("aucun autre fichier CSS de src/ ne déclare ces variables", () => {
    const cssFiles = walk(stylesDir, []).filter((f) => f.endsWith(".css"));
    const names = cssFiles.map((f) => relative(stylesDir, f));
    expect(names).toContain("tentative.css");
    const declaring = cssFiles
      .filter((f) => !f.endsWith("tentative.css"))
      .filter((f) => TENTATIVE.some((n) => new RegExp(`${n}\\s*:`).test(readFileSync(f, "utf8"))));
    expect(declaring.map((f) => relative(stylesDir, f))).toEqual([]);
  });
});
