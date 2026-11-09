import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  checkSpec,
  EmitIdeaError,
  emitIdeaIndex,
  emitIdeaPage,
  emitIdeaSynthesis,
  type IdeaIndex,
  type IdeaPageFile,
} from "../src/index.ts";
import { deepFreeze, validFiles } from "./helpers.ts";

/**
 * TK-89 lot B (T3) : émetteurs purs des fichiers `idea/<slug>.md` et `idea/_index.yaml`
 * (passation 02 §4). Les valeurs sont sérialisées par `yaml` : un titre avec `:`, `#` ou des
 * guillemets se relit à l'identique ; un saut de ligne ou un caractère de contrôle est refusé.
 */
const page = (over: Partial<IdeaPageFile> = {}): IdeaPageFile => ({
  slug: "perimetre",
  title: "Périmètre",
  status: "draft",
  required: true,
  origin: "template",
  updatedAt: "2026-11-05T09:30:00.000Z",
  contributors: ["Awa", "Marie Lefèvre"],
  contentMd: "## Dans le périmètre\n\n- Une chose\n",
  ...over,
});

const frontmatterOf = (text: string): Record<string, unknown> => {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) throw new Error("pas d'en-tête");
  return parse(match[1] ?? "") as Record<string, unknown>;
};

describe("emitIdeaPage", () => {
  it("écrit l'en-tête de la passation puis le titre et le contenu", () => {
    const text = emitIdeaPage(page());
    expect(frontmatterOf(text)).toEqual({
      id: "perimetre",
      titre: "Périmètre",
      statut: "brouillon",
      requise: true,
      origine: "template",
      mis_a_jour: "2026-11-05",
      contributeurs: ["Awa", "Marie Lefèvre"],
    });
    expect(text.endsWith("---\n# Périmètre\n\n## Dans le périmètre\n\n- Une chose\n")).toBe(true);
  });

  it("traduit les statuts : empty vide, draft brouillon, review a-relire, stable stable", () => {
    const statuts = (["empty", "draft", "review", "stable"] as const).map(
      (status) => frontmatterOf(emitIdeaPage(page({ status }))).statut,
    );
    expect(statuts).toEqual(["vide", "brouillon", "a-relire", "stable"]);
  });

  it("page vide : titre seul, aucune ligne en trop", () => {
    expect(
      emitIdeaPage(page({ contentMd: "", contributors: [] })).endsWith("---\n# Périmètre\n"),
    ).toBe(true);
  });

  it("un titre avec deux-points, dièse et guillemets se relit à l'identique", () => {
    const title = `Risque: "coût" # 2 'x' - [a]`;
    expect(frontmatterOf(emitIdeaPage(page({ title }))).titre).toBe(title);
  });

  it("refuse un saut de ligne ou un caractère de contrôle dans le titre, le slug ou un contributeur", () => {
    for (const over of [
      { title: "a\nb" },
      { title: "a\rb" },
      { title: "a\u0000b" },
      { title: "a\u2028b" },
      { slug: "a\nb" },
      { contributors: ["Eve\nstatut: stable"] },
    ]) {
      expect(() => emitIdeaPage(page(over))).toThrow(EmitIdeaError);
    }
  });

  it("refuse une date mal formée et un NUL dans le contenu", () => {
    expect(() => emitIdeaPage(page({ updatedAt: "hier" }))).toThrow(EmitIdeaError);
    expect(() => emitIdeaPage(page({ contentMd: "a\u0000b" }))).toThrow(EmitIdeaError);
  });

  it("est pure : l'entrée figée n'est pas modifiée, deux appels donnent le même texte", () => {
    const input = deepFreeze(page());
    expect(emitIdeaPage(input)).toBe(emitIdeaPage(input));
  });
});

const index = (over: Partial<IdeaIndex> = {}): IdeaIndex => ({
  structure: "cadrage-par-defaut",
  pages: [
    { slug: "perimetre", title: "Périmètre", position: 1, required: true, origin: "template" },
    { slug: "vision", title: "Vision", position: 0, required: true, origin: "template" },
    {
      slug: "concurrence",
      title: "Concurrence: et alternatives",
      position: 2,
      required: false,
      origin: "agent",
    },
    { slug: "glossaire", title: "Glossaire", position: 3, required: false, origin: "user" },
  ],
  ...over,
});

describe("emitIdeaIndex", () => {
  it("range les pages par position, requise seulement quand vraie, origine seulement hors gabarit", () => {
    const parsed = parse(emitIdeaIndex(index())) as { structure: string; pages: unknown[] };
    expect(parsed.structure).toBe("cadrage-par-defaut");
    expect(parsed.pages).toEqual([
      { slug: "vision", titre: "Vision", requise: true },
      { slug: "perimetre", titre: "Périmètre", requise: true },
      { slug: "concurrence", titre: "Concurrence: et alternatives", origine: "agent" },
      { slug: "glossaire", titre: "Glossaire", origine: "user" },
    ]);
  });

  it("une page par ligne, en notation compacte, sous un commentaire de chemin", () => {
    const text = emitIdeaIndex(index());
    expect(text.startsWith("# idea/_index.yaml\n")).toBe(true);
    expect(text).toContain("  - { slug: vision, titre: Vision, requise: true }");
  });

  it("refuse un titre sur plusieurs lignes ou un slug en double", () => {
    expect(() =>
      emitIdeaIndex(
        index({
          pages: [{ slug: "a", title: "x\ny", position: 0, required: false, origin: "user" }],
        }),
      ),
    ).toThrow(EmitIdeaError);
    const p = { slug: "a", title: "A", position: 0, required: false, origin: "user" } as const;
    expect(() => emitIdeaIndex(index({ pages: [p, { ...p, position: 1 }] }))).toThrow(
      EmitIdeaError,
    );
  });
});

describe("checkSpec et le dossier idea/", () => {
  it("ne signale rien de plus quand idea/ est ajouté à une spec valide", () => {
    const before = checkSpec(validFiles()).issues;
    const files = [
      ...validFiles(),
      { path: "idea/perimetre.md", content: emitIdeaPage(page()) },
      { path: "idea/_index.yaml", content: emitIdeaIndex(index()) },
    ];
    expect(checkSpec(files).issues).toEqual(before);
  });
});

describe("emitIdeaSynthesis (TK-91) : idea/_synthese.md", () => {
  const input = {
    source: "idea-v1",
    updatedAt: "2026-11-09T09:30:00.000Z",
    contentMd: "## Résumé\n\nUn outil de cadrage.\n",
  };

  it("écrit un en-tête signalé généré (genere: true), la source, la date, puis le contenu", () => {
    const text = emitIdeaSynthesis(input);
    expect(text.startsWith("---\n")).toBe(true);
    expect(text).toContain("genere: true");
    expect(text).toContain("source: idea-v1");
    const header = frontmatterOf(text);
    expect(header).toMatchObject({
      id: "_synthese",
      titre: "Synthèse",
      genere: true,
      source: "idea-v1",
      mis_a_jour: "2026-11-09",
    });
    expect(text).toContain("# Synthèse\n\n## Résumé\n\nUn outil de cadrage.\n");
  });

  it("est pure : même entrée, même texte, entrée gelée non modifiée", () => {
    const frozen = deepFreeze({ ...input });
    expect(emitIdeaSynthesis(frozen)).toBe(emitIdeaSynthesis(input));
  });

  it.each(["idea-v0", "idea-v1\nx: y", "v1", "idea-v10000", ""])(
    "refuse la source %j (EmitIdeaError, pointeur /source)",
    (source) => {
      expect(() => emitIdeaSynthesis({ ...input, source })).toThrow(EmitIdeaError);
      try {
        emitIdeaSynthesis({ ...input, source });
      } catch (error) {
        expect((error as EmitIdeaError).path).toBe("/source");
      }
    },
  );

  it("refuse une date invalide et un NUL dans le contenu", () => {
    expect(() => emitIdeaSynthesis({ ...input, updatedAt: "demain" })).toThrow(EmitIdeaError);
    expect(() => emitIdeaSynthesis({ ...input, contentMd: "a\0b" })).toThrow(EmitIdeaError);
  });

  it("un contenu vide n'écrit que le titre", () => {
    expect(emitIdeaSynthesis({ ...input, contentMd: "  " }).endsWith("# Synthèse\n")).toBe(true);
  });

  it("checkSpec ne dit rien de plus quand idea/_synthese.md est ajouté", () => {
    const before = checkSpec(validFiles()).issues;
    const files = [
      ...validFiles(),
      { path: "idea/_synthese.md", content: emitIdeaSynthesis(input) },
    ];
    expect(checkSpec(files).issues).toEqual(before);
  });
});
