import { describe, expect, it } from "vitest";
import {
  applyBlockOperation,
  hasBlock,
  IdeaOperationError,
  joinBlocks,
  numberedBlocks,
  splitBlocks,
} from "../src/idea/idea-markdown-ops.ts";

/**
 * TK-90 (lot A, B222) : le Markdown n'a pas d'identifiant de bloc. Un bloc est un bloc de premier niveau
 * (paragraphe, titre, liste, citation, code), séparé du suivant par une ligne vide ; un bloc de code
 * clôturé reste entier même s'il contient des lignes vides. Fonctions pures.
 */
const DOC = "# Vision\n\nPremier paragraphe.\n\n- un\n- deux\n\nDernier.";

describe("splitBlocks et joinBlocks", () => {
  it("découpe aux lignes vides : titre, paragraphe, liste (d'un bloc) et dernier paragraphe", () => {
    expect(splitBlocks(DOC)).toEqual([
      "# Vision",
      "Premier paragraphe.",
      "- un\n- deux",
      "Dernier.",
    ]);
  });

  it("un contenu vide ou blanc n'a aucun bloc", () => {
    expect(splitBlocks("")).toEqual([]);
    expect(splitBlocks("  \n\n \n")).toEqual([]);
  });

  it("plusieurs lignes vides et fins de ligne Windows comptent pour une séparation", () => {
    expect(splitBlocks("A\r\n\r\n\r\n\r\nB\r\n")).toEqual(["A", "B"]);
  });

  it("un bloc de code clôturé contenant une ligne vide reste un seul bloc", () => {
    const code = "```\nligne 1\n\nligne 2\n```";
    expect(splitBlocks(`Avant\n\n${code}\n\nAprès`)).toEqual(["Avant", code, "Après"]);
  });

  it("joinBlocks sépare par une ligne vide, sans fin de ligne finale", () => {
    expect(joinBlocks(["A", "B"])).toBe("A\n\nB");
    expect(joinBlocks([])).toBe("");
    expect(joinBlocks(splitBlocks(DOC))).toBe(DOC);
  });
});

describe("numberedBlocks", () => {
  it("numérote chaque bloc à partir de 0, pour que le modèle vise un rang", () => {
    expect(numberedBlocks("A\n\nB")).toBe("[0]\nA\n\n[1]\nB");
    expect(numberedBlocks("")).toBe("");
  });
});

describe("applyBlockOperation", () => {
  const op = (over: Record<string, unknown>) =>
    ({ op: "append", anchorBlockIndex: null, rangeEnd: null, contentMd: "Neuf", ...over }) as never;

  it("append ajoute à la fin, y compris sur une page vide", () => {
    expect(applyBlockOperation("A\n\nB", op({}))).toBe("A\n\nB\n\nNeuf");
    expect(applyBlockOperation("", op({}))).toBe("Neuf");
  });

  it("insert_after insère après le bloc de rang donné", () => {
    expect(
      applyBlockOperation("A\n\nB\n\nC", op({ op: "insert_after", anchorBlockIndex: 0 })),
    ).toBe("A\n\nNeuf\n\nB\n\nC");
    expect(applyBlockOperation("A\n\nB", op({ op: "insert_after", anchorBlockIndex: 1 }))).toBe(
      "A\n\nB\n\nNeuf",
    );
  });

  it("replace remplace un bloc, ou une plage de blocs (fin incluse)", () => {
    expect(applyBlockOperation("A\n\nB\n\nC", op({ op: "replace", anchorBlockIndex: 1 }))).toBe(
      "A\n\nNeuf\n\nC",
    );
    expect(
      applyBlockOperation(
        "A\n\nB\n\nC\n\nD",
        op({ op: "replace", anchorBlockIndex: 1, rangeEnd: 2 }),
      ),
    ).toBe("A\n\nNeuf\n\nD");
    expect(
      applyBlockOperation("A\n\nB", op({ op: "replace", anchorBlockIndex: 0, rangeEnd: 1 })),
    ).toBe("Neuf");
  });

  it("le texte inséré peut compter plusieurs blocs et il est rogné", () => {
    expect(applyBlockOperation("A", op({ contentMd: "\n  X\n\nY  \n\n" }))).toBe("A\n\nX\n\nY");
  });

  it.each([
    ["insert_after sans ancre", { op: "insert_after" }],
    ["insert_after hors du document", { op: "insert_after", anchorBlockIndex: 2 }],
    ["insert_after négatif", { op: "insert_after", anchorBlockIndex: -1 }],
    ["replace sans ancre", { op: "replace" }],
    ["replace dont la fin sort du document", { op: "replace", anchorBlockIndex: 1, rangeEnd: 2 }],
    ["replace dont la fin précède l'ancre", { op: "replace", anchorBlockIndex: 1, rangeEnd: 0 }],
    ["create_page n'est pas une opération de bloc", { op: "create_page" }],
  ])("refuse %s (IdeaOperationError)", (_label, over) => {
    expect(() => applyBlockOperation("A\n\nB", op(over))).toThrow(IdeaOperationError);
  });

  it("n'altère pas l'entrée et rend un contenu stable (idempotence du découpage)", () => {
    const before = "A\n\nB";
    const after = applyBlockOperation(before, op({ op: "insert_after", anchorBlockIndex: 0 }));
    expect(before).toBe("A\n\nB");
    expect(joinBlocks(splitBlocks(after))).toBe(after);
  });
});

describe("hasBlock", () => {
  it("dit si une ancre (et sa fin) visent un bloc existant", () => {
    expect(hasBlock("A\n\nB", 1)).toBe(true);
    expect(hasBlock("A\n\nB", 2)).toBe(false);
    expect(hasBlock("A\n\nB", 0, 1)).toBe(true);
    expect(hasBlock("A\n\nB", 0, 2)).toBe(false);
    expect(hasBlock("", 0)).toBe(false);
  });
});
