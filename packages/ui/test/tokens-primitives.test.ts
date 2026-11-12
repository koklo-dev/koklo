import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { compileIndexCss } from "./helpers/compile-css.ts";
import { effectiveTheme, loadBlocks, norm } from "./helpers/css.ts";
import { cssPath, uiRoot } from "./helpers/paths.ts";

/** TK-138 lot A (DESIGN.md §5.5, catalogue §2) : jetons des primitives de base. */
const ruleOf = (css: string, utility: string): string =>
  new RegExp(`\\.${utility.replace(/[-/]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ??
  "";

const UTILITIES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["text-card-title", ["font-size", "font-weight"]],
  ["text-dialog-title", ["font-size", "font-weight"]],
  ["text-stat", ["font-size", "font-weight", "letter-spacing"]],
  ["text-count", ["font-size", "font-weight"]],
  ["text-code-sm", ["font-size", "font-weight"]],
  ["text-settings-title", ["font-size", "font-weight"]],
  ["bg-alert-success", ["background-color"]],
  ["border-alert-success-border", ["border-color"]],
  ["text-alert-success-foreground", ["color"]],
  ["bg-overlay", ["background-color"]],
  ["shadow-dialog", ["box-shadow"]],
  ["shadow-sheet", ["box-shadow"]],
  ["shadow-toast", ["box-shadow"]],
  ["rounded-card", ["border-radius"]],
  ["rounded-dialog", ["border-radius"]],
];

describe("utilitaires des primitives compilent", () => {
  let css = "";
  beforeAll(async () => {
    css = await compileIndexCss(UTILITIES.map(([u]) => u));
  });

  it.each(UTILITIES)("%s est généré et porte %j", (utility, props) => {
    const rule = ruleOf(css, utility);
    expect(rule, `.${utility} absent`).not.toBe("");
    for (const prop of props) expect(rule, `${utility} : ${prop}`).toContain(`${prop}:`);
  });

  it.each([
    ["text-card-title", "15px", "600"],
    ["text-dialog-title", "18px", "600"],
    ["text-stat", "24px", "600"],
    ["text-count", "11px", "600"],
    ["text-code-sm", "11px", "500"],
    ["text-settings-title", "20px", "600"],
  ])("%s : %s / %s", (utility, size, weight) => {
    const vars = loadBlocks(cssPath.typography)[":root"] ?? {};
    const role = utility.replace("text-", "");
    expect(vars[`--text-${role}-size`]).toBe(size);
    expect(vars[`--text-${role}-weight`]).toBe(weight);
  });

  it("text-stat : interlettrage -0.02em ; rayons 10 et 14", () => {
    const vars = loadBlocks(cssPath.typography)[":root"] ?? {};
    expect(vars["--text-stat-tracking"]).toBe("-0.02em");
    const root = effectiveTheme(":root");
    expect(root["--radius-card"]).toBe("10px");
    expect(root["--radius-dialog"]).toBe("14px");
    expect(ruleOf(css, "rounded-card")).toContain("var(--radius-card)");
    expect(ruleOf(css, "rounded-dialog")).toContain("var(--radius-dialog)");
  });
});

describe("jetons de couleur, d'ombre et de voile", () => {
  const status = loadBlocks(cssPath.status);
  it.each([
    ["bg", "#f0fdf4", "#0f2a1a"],
    ["border", "#bbf7d0", "#14532d"],
    ["fg", "#14532d", "#bbf7d0"],
  ])("--alert-success-%s : %s clair, %s sombre", (part, light, dark) => {
    expect(norm(status[":root"]?.[`--alert-success-${part}`])).toBe(light);
    expect(norm(status[".dark"]?.[`--alert-success-${part}`])).toBe(dark);
  });

  it.each([
    ["--overlay", "rgb(13 11 28 / 0.38)", "rgb(0 0 0 / 0.55)"],
    ["--shadow-dialog", "0 18px 44px rgb(20 16 43 / 0.2)", "none"],
    ["--shadow-sheet", "-16px 0 40px rgb(20 16 43 / 0.22)", "-16px 0 40px rgb(20 16 43 / 0.22)"],
    ["--shadow-toast", "0 8px 24px rgb(20 16 43 / 0.25)", "0 8px 24px rgb(20 16 43 / 0.25)"],
  ])("%s dans theme.css", (name, light, dark) => {
    expect(norm(effectiveTheme(":root")[name])).toBe(norm(light));
    expect(norm(effectiveTheme(".dark")[name])).toBe(norm(dark));
  });
});

const ICONS = [
  "wand_stars",
  "keyboard_arrow_down",
  "progress_activity",
  "check_box",
  "check_box_outline_blank",
  "content_copy",
  "swap_horiz",
  "person_add",
  "schedule_send",
  "widgets",
  "cloud_done",
  "apartment",
  "groups",
  "key",
  "badge",
  "sync_problem",
  "arrow_forward",
  "admin_panel_settings",
  "speed",
  "description",
  "subdirectory_arrow_right",
  "group", // TK-141 : navigation Réglages
] as const;

describe("icônes de TK-138 générées", () => {
  it.each(ICONS)("%s : fichier généré et déclaré au registre", (name) => {
    expect(existsSync(join(uiRoot, "src/icons/generated", `${name}.ts`)), name).toBe(true);
    expect(readFileSync(join(uiRoot, "scripts/generate-icons.ts"), "utf8")).toContain(`"${name}"`);
  });
});
