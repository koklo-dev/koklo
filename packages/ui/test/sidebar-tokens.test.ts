import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertContrast, WCAG_AA_TEXT } from "./helpers/contrast.ts";
import { effectiveTheme, loadBlocks } from "./helpers/css.ts";
import { cssPath, stylesDir } from "./helpers/paths.ts";

/** Mapping décidé par 02-design.md §2 : chaque --sidebar-* pointe vers un token existant. */
const MAPPING: Record<string, string> = {
  "--sidebar": "var(--card)",
  "--sidebar-foreground": "var(--card-foreground)",
  "--sidebar-primary": "var(--primary)",
  "--sidebar-primary-foreground": "var(--primary-foreground)",
  "--sidebar-accent": "var(--accent)",
  "--sidebar-accent-foreground": "var(--accent-foreground)",
  "--sidebar-border": "var(--border)",
  "--sidebar-ring": "var(--ring)",
};

const themeBlocks = loadBlocks(cssPath.theme);
const indexCss = readFileSync(join(stylesDir, "index.css"), "utf8");

describe("T2.4 : variables --sidebar-* dans theme.css", () => {
  it.each(Object.entries(MAPPING))(
    "%s vaut %s dans :root (suit aussi le sombre)",
    (name, value) => {
      expect(themeBlocks[":root"]?.[name], name).toBe(value);
    },
  );

  it("aucune variable --sidebar-* ne contient de couleur en dur, clair ou sombre", () => {
    for (const selector of [":root", ".dark"]) {
      for (const [name, value] of Object.entries(themeBlocks[selector] ?? {})) {
        if (!name.startsWith("--sidebar")) continue;
        expect(value, `${selector} ${name}`).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgb\(|hsl\(/i);
      }
    }
  });

  it("chaque --sidebar-* est exposée à Tailwind (@theme inline : --color-sidebar…)", () => {
    const body = /@theme\s+inline\s*\{([^}]*)\}/.exec(indexCss)?.[1] ?? "";
    for (const name of Object.keys(MAPPING)) {
      expect(body, name).toContain(`var(${name})`);
    }
    expect(body).toMatch(/--color-sidebar\s*:/);
  });

  it("largeur de la barre : 15.5rem (248 px, DESIGN §5) définie par variable", () => {
    const sidebar = join(stylesDir, "../components/sidebar.tsx");
    const sources = [
      indexCss,
      readFileSync(cssPath.theme, "utf8"),
      existsSync(sidebar) ? readFileSync(sidebar, "utf8") : "",
    ].join("\n");
    expect(sources).toMatch(/--sidebar-width\s*:\s*15\.5rem/);
  });
});

describe.each([":root", ".dark"] as const)("T2.4 : contraste AA des paires sidebar (%s)", (sel) => {
  const theme = effectiveTheme(sel);
  it.each([
    ["--card-foreground", "--card"],
    ["--accent-foreground", "--accent"],
  ])("--sidebar-foreground / accent via %s sur %s >= 4,5:1", (fg, bg) => {
    expect(
      assertContrast(`${sel} ${fg}/${bg}`, theme[fg] as string, theme[bg] as string),
    ).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });
});
