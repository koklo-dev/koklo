import { describe, expect, it } from "vitest";
import {
  DELIVERABLE_DEPENDENCIES,
  DELIVERABLE_SOURCES,
  type DeliverableKey,
  deliverablesAvailabilityOf,
  ideaPagesDiff,
  staleLivrables,
} from "../src/index.ts";

/**
 * TK-100 lot C (B1, B328) : graphe des sources des livrables, impact amont d'un changement (transitif, dans l'ordre du
 * graphe), diff de deux versions d'idée. Règles pures.
 */
describe("graphe des sources", () => {
  it("le Fonctionnel lit l'idée ; chaque autre livrable lit son amont de B1", () => {
    expect(DELIVERABLE_SOURCES.functional).toEqual(["idea"]);
    for (const [key, upstream] of Object.entries(DELIVERABLE_DEPENDENCIES)) {
      if (key !== "functional") {
        expect(DELIVERABLE_SOURCES[key as DeliverableKey], key).toEqual(upstream);
      }
    }
  });
});

describe("staleLivrables", () => {
  it("un changement de l'idée touche les sept livrables, dans l'ordre du graphe", () => {
    expect(staleLivrables(["idea"])).toEqual([
      "functional",
      "data",
      "architecture",
      "technical",
      "security",
      "design",
      "quality",
    ]);
  });

  it("transitivité : Données touche Architecture, Technique, Sécurité et Qualité, pas Données", () => {
    expect(staleLivrables(["data"])).toEqual(["architecture", "technical", "security", "quality"]);
  });

  it("Design ne touche que Qualité ; Qualité ne touche rien ; rien ne touche rien", () => {
    expect(staleLivrables(["design"])).toEqual(["quality"]);
    expect(staleLivrables(["quality"])).toEqual([]);
    expect(staleLivrables([])).toEqual([]);
  });

  it("plusieurs sources : union sans doublon", () => {
    expect(staleLivrables(["design", "security"])).toEqual(["quality"]);
  });
});

describe("le forçage ne masque pas un livrable à revoir", () => {
  it("un livrable forcé et à revoir reste « revise », ouvert et marqué forcé", () => {
    const todo = Object.fromEntries(
      Object.keys(DELIVERABLE_DEPENDENCIES).map((key) => [key, "todo"]),
    ) as Record<DeliverableKey, "todo" | "revise">;
    const out = deliverablesAvailabilityOf({
      ideaFrozen: true,
      functionalHasEntity: true,
      statuses: { ...todo, architecture: "revise" },
      forced: ["architecture"],
    }).find((entry) => entry.key === "architecture");
    expect(out).toMatchObject({ status: "revise", forced: true, available: true });
  });
});

describe("ideaPagesDiff", () => {
  it("pages ajoutées, modifiées et retirées entre deux versions", () => {
    const diff = ideaPagesDiff(
      { vision: 1, personas: 1, old: 3 },
      { vision: 2, personas: 1, new: 1 },
    );
    expect(diff).toEqual({
      added: ["new"],
      modified: ["vision"],
      removed: ["old"],
      changedPages: 3,
    });
  });

  it("deux versions identiques : aucun changement", () => {
    expect(ideaPagesDiff({ a: 1 }, { a: 1 })).toEqual({
      added: [],
      modified: [],
      removed: [],
      changedPages: 0,
    });
  });

  it("listes triées par identifiant de page, indépendantes de l'ordre des clés", () => {
    const diff = ideaPagesDiff({}, { b: 1, a: 1 });
    expect(diff.added).toEqual(["a", "b"]);
  });
});
