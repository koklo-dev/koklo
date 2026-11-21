import { describe, expect, it } from "vitest";
import {
  docGapsOf,
  markdownBlocks,
  markValidatedOperation,
  sectionNumber,
  selectedSectionOf,
} from "../src/lib/architecture-document.ts";

/** TK-111 lot C (maquette 13 l.273-325, 750-800) : lecture du document, ordre, manques de la colonne Agent. */
const section = (num: number, slug: string, status: string, markdown = "") => ({
  specId: `DOC-${slug}`,
  slug,
  num,
  path: `architecture/overview/${String(num).padStart(2, "0")}-${slug}.md`,
  title: slug,
  status: status as "validee",
  markdown,
  updatedAt: null,
  lastAuthor: null,
});

describe("markdownBlocks", () => {
  it("titres, paragraphes et puces ; les puces consécutives forment une liste", () => {
    expect(
      markdownBlocks(
        "# Principes\n\nCes règles guident tous les choix :\n- un module ne lit jamais les tables d'un autre\n- seule l'API écrit en base\n\n## Suite\nFin",
      ),
    ).toEqual([
      { kind: "h", text: "Principes" },
      { kind: "p", text: "Ces règles guident tous les choix :" },
      {
        kind: "ul",
        items: ["un module ne lit jamais les tables d'un autre", "seule l'API écrit en base"],
      },
      { kind: "h", text: "Suite" },
      { kind: "p", text: "Fin" },
    ]);
  });

  it("une section vide ne rend aucun bloc ; rien n'est interprété (HTML en texte)", () => {
    expect(markdownBlocks("")).toEqual([]);
    expect(markdownBlocks("<img src=x onerror=alert(1)>")).toEqual([
      { kind: "p", text: "<img src=x onerror=alert(1)>" },
    ]);
  });
});

describe("sections", () => {
  const sections = [
    section(1, "contexte", "validee"),
    section(2, "principes", "a_relire", "# P"),
    section(3, "sauvegarde", "a_rediger"),
  ];

  it("numéro sur deux chiffres", () => {
    expect(sectionNumber(7)).toBe("07");
    expect(sectionNumber(12)).toBe("12");
  });

  it("la section ouverte est celle de ?s=, sinon la première", () => {
    expect(selectedSectionOf(sections, "principes")?.slug).toBe("principes");
    expect(selectedSectionOf(sections, "inconnue")?.slug).toBe("contexte");
    expect(selectedSectionOf(sections, undefined)?.slug).toBe("contexte");
    expect(selectedSectionOf([], undefined)).toBeUndefined();
  });

  it("« Ce qui manque encore » liste les sections à rédiger", () => {
    expect(docGapsOf(sections)).toEqual(["sauvegarde : section vide."]);
    expect(docGapsOf([section(1, "a", "validee")])).toEqual([]);
  });

  it("« Marquer comme validée » : doc.section.update du statut seul", () => {
    expect(markValidatedOperation("DOC-principes")).toEqual({
      kind: "doc.section.update",
      specId: "DOC-principes",
      status: "validee",
    });
  });
});
