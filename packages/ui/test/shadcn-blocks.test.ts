import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { uiRoot } from "./helpers/paths.ts";

/** TK-85 correction, cas 1 : primitives installées par `shadcn add` (structure fidèle, pas recopiée). */
const components = join(uiRoot, "src/components");
const read = (name: string) => {
  const file = join(components, name);
  if (!existsSync(file)) throw new Error(`Fichier généré attendu absent : ${file}`);
  return readFileSync(file, "utf8");
};

describe("cas 1 : primitives shadcn dans packages/ui", () => {
  it.each(["breadcrumb", "collapsible", "field", "label"])("%s.tsx est généré", (name) => {
    expect(read(`${name}.tsx`).length).toBeGreaterThan(0);
  });

  it("sidebar.tsx est UN fichier qui définit tous les exports du bloc", () => {
    const src = read("sidebar.tsx");
    for (const name of [
      "Sidebar",
      "SidebarContent",
      "SidebarFooter",
      "SidebarGroup",
      "SidebarGroupLabel",
      "SidebarHeader",
      "SidebarInset",
      "SidebarMenu",
      "SidebarMenuButton",
      "SidebarMenuItem",
      "SidebarMenuSub",
      "SidebarMenuSubButton",
      "SidebarMenuSubItem",
      "SidebarProvider",
      "SidebarRail",
      "SidebarTrigger",
      "useSidebar",
    ]) {
      expect(src, `${name} défini dans sidebar.tsx`).toMatch(
        new RegExp(`(function|const)\\s+${name}\\b`),
      );
    }
    expect(src).not.toMatch(/from\s+["']\.\/sidebar-(context|group|menu)/);
  });

  it.each(["sidebar-context", "sidebar-group", "sidebar-menu"])(
    "%s.tsx (ancien éclatement) n'existe plus",
    (name) => {
      expect(existsSync(join(components, `${name}.tsx`))).toBe(false);
    },
  );

  it("le barrel exporte breadcrumb, collapsible, field, label et plus les fichiers éclatés", () => {
    const index = readFileSync(join(uiRoot, "src/index.ts"), "utf8");
    for (const name of ["breadcrumb", "collapsible", "field", "label", "sidebar"]) {
      expect(index).toContain(`./components/${name}.tsx`);
    }
    expect(index).not.toMatch(/sidebar-(context|group|menu)/);
  });
});
