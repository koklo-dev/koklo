import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFeatureMarkdown } from "../src/index.ts";
import { splitFrontMatter } from "../src/parse/frontmatter.ts";
import { validFile } from "./helpers.ts";

/**
 * TK-53a : `splitFrontMatter` quitte `parse/feature-markdown.ts` pour un module partagé
 * `src/parse/frontmatter.ts` (réutilisé par le futur parseur de règles métier, TK-53c).
 * Signature : `splitFrontMatter(content: string): { front: string; body: string[] } | undefined`.
 * Comportement IDENTIQUE à l'ancien : BOM retiré, séparateur de lignes `\r?\n`, délimiteurs `---`
 * tolérant les espaces de fin, `undefined` si absent ou non terminé, ne lève jamais.
 */
describe("splitFrontMatter : comportement conservé", () => {
  it("sépare le front matter du corps, ligne vide du corps conservée", () => {
    expect(splitFrontMatter("---\nid: F-1\ntitre: T\n---\n\n## Description\nx\n")).toEqual({
      front: "id: F-1\ntitre: T",
      body: ["", "## Description", "x", ""],
    });
  });

  it("accepte CRLF", () => {
    expect(splitFrontMatter("---\r\nid: x\r\n---\r\ncorps\r\n")).toEqual({
      front: "id: x",
      body: ["corps", ""],
    });
  });

  it("retire un BOM initial", () => {
    expect(splitFrontMatter("﻿---\nid: x\n---\ncorps")).toEqual({
      front: "id: x",
      body: ["corps"],
    });
  });

  it("tolère des espaces après les délimiteurs", () => {
    expect(splitFrontMatter("---  \nid: x\n---\t\ncorps")).toEqual({
      front: "id: x",
      body: ["corps"],
    });
  });

  it("front matter vide", () => {
    expect(splitFrontMatter("---\n---\ncorps")).toEqual({ front: "", body: ["corps"] });
  });

  it("s'arrête au premier second délimiteur et garde les `---` suivants dans le corps", () => {
    expect(splitFrontMatter("---\na: 1\n---\ntexte\n---\nsuite")).toEqual({
      front: "a: 1",
      body: ["texte", "---", "suite"],
    });
  });

  it.each([
    ["contenu vide", ""],
    ["pas de front matter", "## Description\nx\n"],
    ["ligne vide avant le délimiteur", "\n---\na: 1\n---\n"],
    ["délimiteur indenté", " ---\na: 1\n---\n"],
    ["délimiteur suivi de texte", "--- x\na: 1\n---\n"],
    ["front matter non terminé", "---\na: 1\nb: 2\n"],
    ["un seul délimiteur", "---"],
  ])("undefined : %s", (_label, content) => {
    expect(splitFrontMatter(content)).toBeUndefined();
  });

  it("ne lève jamais sur du contenu absurde", () => {
    for (const junk of ["\u0000", "---\n\u0000\n---", "﻿", "---\r", "\r\n---\r\n---"]) {
      expect(() => splitFrontMatter(junk)).not.toThrow();
    }
  });
});

describe("splitFrontMatter : module partagé", () => {
  const source = (file: string) =>
    readFileSync(resolve(import.meta.dirname, "../src", file), "utf8");

  it("n'est plus défini dans feature-markdown.ts, qui l'importe du module partagé", () => {
    const feature = source("parse/feature-markdown.ts");
    expect(feature).not.toMatch(/function\s+splitFrontMatter/);
    expect(feature).toMatch(
      /import\s*\{[^}]*\bsplitFrontMatter\b[^}]*\}\s*from\s*"\.\/frontmatter\.ts"/,
    );
  });
});

describe("non-régression de parseFeatureMarkdown (comportement inchangé par l'extraction)", () => {
  const PATH = "features/F-001-inscription.md";
  const fixture = validFile(PATH);

  it("CRLF et BOM donnent la même feature que le LF", () => {
    const lf = parseFeatureMarkdown(PATH, fixture);
    const crlf = parseFeatureMarkdown(PATH, fixture.replace(/\n/g, "\r\n"));
    const bom = parseFeatureMarkdown(PATH, `﻿${fixture}`);
    expect(lf.ok).toBe(true);
    expect(crlf).toEqual(lf);
    expect(bom).toEqual(lf);
  });

  it("front matter absent ou non terminé : STRUCT_FRONT_MATTER_MISSING sans pointeur", () => {
    for (const content of ["## Description\nx\n", "---\nid: F-001\n## Description\nx\n"]) {
      const res = parseFeatureMarkdown(PATH, content);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.issues).toMatchObject([
          { code: "STRUCT_FRONT_MATTER_MISSING", path: PATH, pointer: "", severity: "error" },
        ]);
      }
    }
  });
});
