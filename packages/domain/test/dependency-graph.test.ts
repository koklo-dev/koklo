import { describe, expect, it } from "vitest";
import {
  addDependency,
  createDependencyGraph,
  DEPENDENCY_TYPES,
  DependencyCycleError,
  type DependencyGraph,
  dependenciesOf,
  dependencyEdges,
  InvalidDependencyTypeError,
  InvalidTicketKeyError,
} from "../src/index.ts";

/** "A>B" = A dépend de B ; type par défaut blocks. */
const edge = (ticket: string, dependsOn: string, type: "blocks" | "related" = "blocks") => ({
  ticket,
  dependsOn,
  type,
});

const build = (...edges: ReturnType<typeof edge>[]): DependencyGraph =>
  edges.reduce(addDependency, createDependencyGraph());

const snapshot = (graph: DependencyGraph) => JSON.stringify(dependencyEdges(graph));

const cycleOf = (graph: DependencyGraph, added: ReturnType<typeof edge>): DependencyCycleError => {
  try {
    addDependency(graph, added);
  } catch (error) {
    expect(error).toBeInstanceOf(DependencyCycleError);
    return error as DependencyCycleError;
  }
  throw new Error("DependencyCycleError attendue");
};

describe("contrat du graphe", () => {
  it("DEPENDENCY_TYPES est la liste fermée blocks | related", () => {
    expect([...DEPENDENCY_TYPES]).toEqual(["blocks", "related"]);
  });

  it("un graphe vide n'a aucune arête ; addDependency enregistre l'arête orientée", () => {
    expect(dependencyEdges(createDependencyGraph())).toEqual([]);
    const graph = build(edge("TK-1", "TK-2", "related"));
    expect(dependenciesOf(graph, "TK-1")).toEqual([edge("TK-1", "TK-2", "related")]);
    expect(dependenciesOf(graph, "TK-2")).toEqual([]);
    expect(dependenciesOf(graph, "TK-99")).toEqual([]);
  });

  it("createDependencyGraph(edges) construit un graphe validé et refuse un cycle", () => {
    const graph = createDependencyGraph([edge("TK-1", "TK-2"), edge("TK-2", "TK-3")]);
    expect(dependencyEdges(graph)).toHaveLength(2);
    expect(() => createDependencyGraph([edge("TK-1", "TK-2"), edge("TK-2", "TK-1")])).toThrow(
      DependencyCycleError,
    );
  });
});

describe("C1 auto-dépendance", () => {
  it("A -> A est refusé (cycle de longueur 1), graphe inchangé", () => {
    const graph = build(edge("TK-1", "TK-2"));
    const before = snapshot(graph);
    const error = cycleOf(graph, edge("TK-3", "TK-3"));
    expect(error.name).toBe("DependencyCycleError");
    expect(error.path).toEqual(["TK-3", "TK-3"]);
    expect(snapshot(graph)).toBe(before);
  });
});

describe("C2 cycle direct", () => {
  it("{A->B} + B->A est refusé, chemin B, A, B", () => {
    const error = cycleOf(build(edge("TK-1", "TK-2")), edge("TK-2", "TK-1"));
    expect(error.path).toEqual(["TK-2", "TK-1", "TK-2"]);
    expect(error.message).toContain("TK-1");
  });
});

describe("C3 cycle indirect à 3 nœuds", () => {
  it("{A->B, B->C} + C->A est refusé, le chemin contient A, B, C et se referme", () => {
    const error = cycleOf(build(edge("TK-1", "TK-2"), edge("TK-2", "TK-3")), edge("TK-3", "TK-1"));
    expect(error.path[0]).toBe(error.path.at(-1));
    expect(new Set(error.path)).toEqual(new Set(["TK-1", "TK-2", "TK-3"]));
    expect(error.path).toEqual(["TK-3", "TK-1", "TK-2", "TK-3"]);
  });
});

describe("C4 cycle indirect long", () => {
  it("chaîne T1->...->T5 puis T5->T1 est refusé", () => {
    const chain = build(
      edge("TK-1", "TK-2"),
      edge("TK-2", "TK-3"),
      edge("TK-3", "TK-4"),
      edge("TK-4", "TK-5"),
    );
    const error = cycleOf(chain, edge("TK-5", "TK-1"));
    expect(new Set(error.path)).toEqual(new Set(["TK-1", "TK-2", "TK-3", "TK-4", "TK-5"]));
  });

  it("supporte une très longue chaîne sans débordement de pile (2000 nœuds)", () => {
    let graph = createDependencyGraph();
    for (let i = 1; i < 2000; i++) graph = addDependency(graph, edge(`TK-${i}`, `TK-${i + 1}`));
    expect(() => addDependency(graph, edge("TK-2000", "TK-1"))).toThrow(DependencyCycleError);
    expect(dependencyEdges(addDependency(graph, edge("TK-1", "TK-2000")))).toHaveLength(2000);
  });
});

describe("C5 losange", () => {
  const diamond = () =>
    build(edge("TK-1", "TK-2"), edge("TK-1", "TK-3"), edge("TK-2", "TK-4"), edge("TK-3", "TK-4"));

  it("D->A est refusé", () => {
    expect(() => addDependency(diamond(), edge("TK-4", "TK-1"))).toThrow(DependencyCycleError);
  });

  it("D->B est refusé", () => {
    expect(() => addDependency(diamond(), edge("TK-4", "TK-2"))).toThrow(DependencyCycleError);
  });

  it("A->D est accepté (arête redondante mais acyclique)", () => {
    const graph = addDependency(diamond(), edge("TK-1", "TK-4"));
    expect(
      dependenciesOf(graph, "TK-1")
        .map((e) => e.dependsOn)
        .sort(),
    ).toEqual(["TK-2", "TK-3", "TK-4"]);
  });
});

describe("C6 pas de faux positif", () => {
  it("accepte diamant, deux racines et graphe non connexe", () => {
    const graph = build(
      edge("TK-1", "TK-2"),
      edge("TK-1", "TK-3"),
      edge("TK-2", "TK-4"),
      edge("TK-3", "TK-4"),
      edge("TK-5", "TK-4"),
      edge("TK-10", "TK-11"),
      edge("TK-12", "TK-11"),
    );
    expect(dependencyEdges(graph)).toHaveLength(7);
  });

  it("deux ordres d'insertion donnent les mêmes arêtes", () => {
    const edges = [edge("TK-1", "TK-2"), edge("TK-2", "TK-3"), edge("TK-4", "TK-3")];
    const forward = snapshot(build(...edges));
    const backward = snapshot(build(...[...edges].reverse()));
    expect(forward).toBe(backward);
  });
});

describe("C7 le DAG porte sur toutes les dépendances", () => {
  it("un cycle fait d'arêtes related est refusé", () => {
    const graph = build(edge("TK-1", "TK-2", "related"));
    expect(() => addDependency(graph, edge("TK-2", "TK-1", "related"))).toThrow(
      DependencyCycleError,
    );
  });

  it("un cycle mixte blocks/related est refusé", () => {
    const graph = build(edge("TK-1", "TK-2", "related"), edge("TK-2", "TK-3", "blocks"));
    expect(() => addDependency(graph, edge("TK-3", "TK-1", "related"))).toThrow(
      DependencyCycleError,
    );
  });
});

describe("C8 atomicité et immutabilité", () => {
  it("un refus laisse le graphe d'entrée identique", () => {
    const graph = build(edge("TK-1", "TK-2"), edge("TK-2", "TK-3"));
    const before = snapshot(graph);
    expect(() => addDependency(graph, edge("TK-3", "TK-1"))).toThrow(DependencyCycleError);
    expect(snapshot(graph)).toBe(before);
  });

  it("un succès renvoie un nouveau graphe sans muter l'ancien", () => {
    const graph = build(edge("TK-1", "TK-2"));
    const next = addDependency(graph, edge("TK-2", "TK-3"));
    expect(next).not.toBe(graph);
    expect(dependencyEdges(graph)).toHaveLength(1);
    expect(dependencyEdges(next)).toHaveLength(2);
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(dependencyEdges(next))).toBe(true);
  });

  it("l'arête passée en entrée n'est pas aliasée", () => {
    const input = { ...edge("TK-1", "TK-2") };
    const graph = addDependency(createDependencyGraph(), input);
    input.dependsOn = "TK-9";
    expect(dependenciesOf(graph, "TK-1")[0]?.dependsOn).toBe("TK-2");
  });
});

describe("C9 erreurs d'entrée", () => {
  it("clé invalide : InvalidTicketKeyError (ticket ou dépendance)", () => {
    const graph = createDependencyGraph();
    expect(() => addDependency(graph, edge("TK-x", "TK-2"))).toThrow(InvalidTicketKeyError);
    expect(() => addDependency(graph, edge("TK-1", "TK-0"))).toThrow(InvalidTicketKeyError);
    expect(() => addDependency(graph, edge("TK-1", 3 as never))).toThrow(InvalidTicketKeyError);
  });

  it("type inconnu : InvalidDependencyTypeError", () => {
    const graph = createDependencyGraph();
    expect(() => addDependency(graph, edge("TK-1", "TK-2", "after" as never))).toThrow(
      InvalidDependencyTypeError,
    );
    const error = (() => {
      try {
        addDependency(graph, edge("TK-1", "TK-2", "after" as never));
      } catch (e) {
        return e as InvalidDependencyTypeError;
      }
    })();
    expect(error?.name).toBe("InvalidDependencyTypeError");
    expect(error?.value).toBe("after");
  });

  it("doublon exact : idempotent (H4), le même graphe est renvoyé", () => {
    const graph = build(edge("TK-1", "TK-2"));
    expect(addDependency(graph, edge("TK-1", "TK-2"))).toBe(graph);
    expect(dependencyEdges(graph)).toHaveLength(1);
  });
});

describe("DependencyCycleError", () => {
  it("est une classe nommée portant le chemin", () => {
    const error = new DependencyCycleError(["TK-1", "TK-2", "TK-1"]);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("DependencyCycleError");
    expect(error.path).toEqual(["TK-1", "TK-2", "TK-1"]);
    expect(error.message).toContain("TK-1 -> TK-2 -> TK-1");
  });
});
