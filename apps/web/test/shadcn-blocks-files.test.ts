import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** TK-85 correction, cas 1 : blocs sidebar-07 / login-05 installés par la CLI dans apps/web. */
const web = join(import.meta.dirname, "..");
const components = join(web, "src/components");

describe("cas 1 : fichiers des blocs dans apps/web", () => {
  it.each(["app-sidebar", "nav-user", "sidebar-organization", "login-form"])(
    "%s.tsx est généré",
    (name) => {
      expect(existsSync(join(components, `${name}.tsx`)), `${name}.tsx absent`).toBe(true);
    },
  );

  it("apps/web/components.json pointe ui vers @koklo/ui et components vers src/components", () => {
    const file = join(web, "components.json");
    expect(existsSync(file), "components.json absent").toBe(true);
    const cfg = JSON.parse(readFileSync(file, "utf8"));
    expect(cfg.aliases.ui).toBe("@koklo/ui");
    expect(cfg.aliases.components).toMatch(/components$/);
    expect(cfg.iconLibrary).toBe("material-symbols");
  });

  it("les blocs v1 remplacés par la coquille (nav-main, nav-projects, team-switcher, app-frame) sont supprimés", () => {
    for (const name of [
      "nav-main",
      "nav-projects",
      "team-switcher",
      "app-frame",
      "projects-frame",
    ]) {
      expect(existsSync(join(components, `${name}.tsx`)), `${name}.tsx présent`).toBe(false);
    }
  });

  it("l'ancien assemblage manuel (app-shell, login-card) est supprimé", () => {
    expect(existsSync(join(components, "app-shell.tsx"))).toBe(false);
    expect(existsSync(join(components, "login-card.tsx"))).toBe(false);
  });

  it("la coquille est un layout partagé du groupe de routes (shell)", () => {
    expect(existsSync(join(web, "src/app/(shell)/layout.tsx"))).toBe(true);
  });
});
