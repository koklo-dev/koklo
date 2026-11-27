import { describe, expect, it } from "vitest";
import {
  DOC_SECTION_DIR,
  DOC_SECTION_DIRS,
  docSectionPath,
  docSectionSlugOf,
  emitDocSection,
  parseDocSection,
} from "../src/index.ts";

/** TK-111 lot B (B508) : section du document d'architecture `architecture/overview/NN-<slug>.md`, sans index en base. */
describe("chemins des sections", () => {
  it("NN sur deux chiffres, slug du titre ; le slug se relit du chemin", () => {
    expect(DOC_SECTION_DIR).toBe("architecture/overview");
    expect(docSectionPath(3, "contexte")).toBe("architecture/overview/03-contexte.md");
    expect(docSectionPath(12, "flux")).toBe("architecture/overview/12-flux.md");
    expect(docSectionSlugOf("architecture/overview/03-contexte.md")).toEqual({
      num: 3,
      slug: "contexte",
    });
    expect(docSectionSlugOf("architecture/overview/contexte.md")).toBeUndefined();
    expect(docSectionSlugOf("architecture/overview/x/03-a.md")).toBeUndefined();
    expect(docSectionSlugOf("data/tables/03-a.md")).toBeUndefined();
  });
});

describe("sections du cahier technique (TK-115)", () => {
  it("même format, dossier choisi par le livrable", () => {
    expect(DOC_SECTION_DIRS).toEqual({
      architecture: "architecture/overview",
      technical: "tech/cahier-technique",
    });
    expect(docSectionPath(1, "objet", "technical")).toBe("tech/cahier-technique/01-objet.md");
    expect(docSectionSlugOf("tech/cahier-technique/01-objet.md", "technical")).toEqual({
      num: 1,
      slug: "objet",
    });
    expect(docSectionSlugOf("tech/cahier-technique/01-objet.md")).toBeUndefined();
    expect(docSectionSlugOf("architecture/overview/01-contexte.md", "technical")).toBeUndefined();
  });
});

describe("lecture d'une section", () => {
  it("sans front matter : titre du premier H1, statut brouillon, corps sans le titre", () => {
    const parsed = parseDocSection("# Architecture : contexte\n\nÀ compléter.\n");
    expect(parsed).toEqual({
      title: "Architecture : contexte",
      status: "brouillon",
      markdown: "À compléter.",
    });
  });

  it("front matter : statut lu ; statut inconnu : brouillon", () => {
    expect(parseDocSection("---\nstatut: validee\n---\n# T\n\nCorps.\n").status).toBe("validee");
    expect(parseDocSection("---\nstatut: a_relire\n---\n# T\n\nCorps.\n").status).toBe("a_relire");
    expect(parseDocSection("---\nstatut: nimporte\n---\n# T\n\nCorps.\n").status).toBe("brouillon");
  });

  it("corps vide : « À rédiger », même avec un statut déclaré", () => {
    expect(parseDocSection("# Titre\n").status).toBe("a_rediger");
    expect(parseDocSection("---\nstatut: validee\n---\n# Titre\n\n").status).toBe("a_rediger");
  });

  it("sans H1, le titre est vide ; un front matter illisible est ignoré", () => {
    expect(parseDocSection("Texte seul.\n").title).toBe("");
    expect(parseDocSection("---\nstatut: [\n---\n# T\n\nX\n").status).toBe("brouillon");
  });
});

describe("écriture d'une section", () => {
  it("front matter fixe, titre, corps ; relecture identique, émission idempotente", () => {
    const text = emitDocSection({
      title: "Contexte",
      status: "a_relire",
      markdown: "Un texte.\n\nDeux.",
    });
    expect(text).toBe("---\nstatut: a_relire\n---\n# Contexte\n\nUn texte.\n\nDeux.\n");
    expect(parseDocSection(text)).toEqual({
      title: "Contexte",
      status: "a_relire",
      markdown: "Un texte.\n\nDeux.",
    });
    expect(emitDocSection(parseDocSection(text))).toBe(text);
  });

  it("section à rédiger : titre seul, sans front matter de statut", () => {
    expect(emitDocSection({ title: "Plus tard", status: "a_rediger", markdown: "" })).toBe(
      "---\nstatut: brouillon\n---\n# Plus tard\n",
    );
  });

  it("titre sur plusieurs lignes ou vide : refusé", () => {
    expect(() => emitDocSection({ title: "A\nB", status: "brouillon", markdown: "x" })).toThrow();
    expect(() => emitDocSection({ title: "", status: "brouillon", markdown: "x" })).toThrow();
  });
});
