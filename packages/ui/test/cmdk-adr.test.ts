import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { iconLoaders } from "../src/icons/generated/registry.ts";

/** TK-88 lot B : ADR 0018 de cmdk (dependency-selection), garde d'import et icônes de la coquille. */
const root = resolve(import.meta.dirname, "../../..");
const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"));

describe("ADR 0018 : cmdk", () => {
  const adrPath = resolve(root, "docs/adr/0018-cmdk.md");

  it("version exacte 1.1.1 dans @koklo/ui", () => {
    expect(pkg.dependencies.cmdk).toBe("1.1.1");
  });

  it("l'ADR existe, est accepté, cite la version, les alternatives et l'absence de vulnérabilité", () => {
    expect(existsSync(adrPath)).toBe(true);
    const adr = readFileSync(adrPath, "utf8");
    expect(adr).toMatch(/status:\s*accepted/);
    expect(adr).toContain("1.1.1");
    expect(adr).toMatch(/Décision/);
    expect(adr).toMatch(/aucune vulnérabilité/i);
    for (const alternative of ["maison", "react-cmdk", "kbar"]) expect(adr).toContain(alternative);
  });

  it("aucun autre paquet du dépôt ne dépend de cmdk ni ne l'importe", () => {
    for (const dir of ["apps", "packages"]) {
      for (const name of readdirSync(join(root, dir))) {
        if (dir === "packages" && name === "ui") continue;
        const manifest = join(root, dir, name, "package.json");
        if (!existsSync(manifest)) continue;
        const json = JSON.parse(readFileSync(manifest, "utf8"));
        expect({ ...json.dependencies, ...json.devDependencies }, manifest).not.toHaveProperty(
          "cmdk",
        );
      }
    }
  });

  it("dans @koklo/ui, seul command-palette.tsx importe cmdk", () => {
    const dir = resolve(import.meta.dirname, "../src/components");
    const importers = readdirSync(dir).filter((f) =>
      /from "cmdk"/.test(readFileSync(join(dir, f), "utf8")),
    );
    expect(importers).toEqual(["command-palette.tsx"]);
  });
});

describe("registre d'icônes : coquille (02-design §4)", () => {
  it.each([
    "menu",
    "space_dashboard",
    "shield",
    "folder_open",
    "lock",
    "search",
    "commit",
    "unfold_more",
    "left_panel_close",
    "left_panel_open",
    "dark_mode",
    "light_mode",
    "view_kanban",
    "lightbulb",
    "smart_toy",
    "schedule",
  ])("%s est dans le registre", (name) => {
    expect(Object.keys(iconLoaders)).toContain(name);
  });
});
