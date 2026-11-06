import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { iconLoaders } from "../src/icons/generated/registry.ts";

/**
 * TK-94 lot B, T18 : ADR 0017 de `@tanstack/react-virtual` (dependency-selection), version épinglée,
 * et icônes du registre demandées par 02-design §1.
 */
const root = resolve(import.meta.dirname, "../../..");

describe("ADR 0017 : @tanstack/react-virtual", () => {
  const adrPath = resolve(root, "docs/adr/0017-tanstack-react-virtual.md");
  const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"));

  it("la dépendance est épinglée à une version exacte, dans @koklo/ui", () => {
    expect(pkg.dependencies["@tanstack/react-virtual"]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("l'ADR existe, est accepté, cite la version et les alternatives écartées", () => {
    expect(existsSync(adrPath)).toBe(true);
    const adr = readFileSync(adrPath, "utf8");
    expect(adr).toMatch(/status:\s*accepted/);
    expect(adr).toContain(pkg.dependencies["@tanstack/react-virtual"]);
    for (const alternative of ["react-window", "react-virtuoso", "maison"]) {
      expect(adr).toContain(alternative);
    }
    expect(adr).toMatch(/Décision/);
  });
});

describe("registre d'icônes : listes longues (02-design §1)", () => {
  it.each([
    "expand_circle_down",
    "search_off",
    "error",
    "done_all",
    "chevron_left",
    "keyboard_arrow_down",
    "arrow_upward",
    "swap_vert",
    "fit_screen",
  ])("%s est au registre", (name) => {
    expect(Object.keys(iconLoaders)).toContain(name);
  });
});
