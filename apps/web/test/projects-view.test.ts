import { describe, expect, it } from "vitest";
import { type ProjectsViewFacts, projectsViewKind } from "../src/lib/projects-view.ts";

const FACTS: ProjectsViewFacts = {
  hasData: true,
  failed: false,
  roleKnown: true,
  filtered: false,
  total: 3,
  shown: 3,
};

/** TK-93 lot B : l'état affiché par `/projects` (S-projects v7 §4). */
describe("projectsViewKind", () => {
  it.each([
    ["des cartes", {}, "grid"],
    ["pas encore de données", { hasData: false }, "loading"],
    ["rôle inconnu", { roleKnown: false }, "loading"],
    ["échec sans rien à montrer", { failed: true, hasData: false }, "error"],
    ["aucun projet, sans filtre", { total: 0, shown: 0 }, "empty"],
    ["aucun résultat avec un filtre", { total: 0, shown: 0, filtered: true }, "no-match"],
  ] as const)("%s : %s", (_label, over, kind) => {
    expect(projectsViewKind({ ...FACTS, ...over })).toBe(kind);
  });
});
