import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TK-59, garde d'architecture « texte brut » (relecture de sécurité du ticket 54, non bloquant n°1) : aucun
 * fichier du lot ne rend du HTML ni du Markdown, aucun lien ne vient d'une sortie du modèle.
 */
const src = join(import.meta.dirname, "../src");

/** Fichiers du lot 59 (noms fixés dans .workflow/TK-59/02-decisions.md). */
const FRAMING_FILES = [
  "app/projects/[projectId]/framing/page.tsx",
  "app/projects/[projectId]/framing/layout.tsx",
  "components/framing-page.tsx",
  "components/ai-send-policy.tsx",
  "components/ai-error-notice.tsx",
  "components/framing-proposals.tsx",
  "components/framing-proposal-card.tsx",
  "components/framing-submit-bar.tsx",
  "lib/ai-errors.ts",
  "lib/use-ai-call.ts",
  "lib/framing-draft.ts",
  "lib/framing-labels.ts",
  "lib/framing-operations.ts",
  "lib/framing-types.ts",
  "lib/use-framing-proposals.ts",
];

/** Tout fichier `framing-*` ou `ai-*` ajouté plus tard au lot est contrôlé aussi. */
function extraFiles(): string[] {
  const found: string[] = [];
  for (const dir of ["components", "lib"]) {
    for (const name of readdirSync(join(src, dir))) {
      if (/^(framing|ai)-.*\.tsx?$/.test(name) || /^use-(framing|ai)-.*\.tsx?$/.test(name))
        found.push(`${dir}/${name}`);
    }
  }
  return found.filter((file) => !FRAMING_FILES.includes(file));
}
const ALL = [...FRAMING_FILES, ...extraFiles()];

const MARKDOWN_LIBS =
  /\b(?:react-markdown|marked|markdown-it|remark|rehype|micromark|mdx|showdown|snarkdown|dompurify|sanitize-html|highlight\.js)\b/i;

describe.each(ALL)("%s", (file) => {
  const path = join(src, file);
  const code = () => readFileSync(path, "utf8");

  it("existe", () => {
    expect(existsSync(path), `${file} absent`).toBe(true);
  });

  it("ne construit aucun HTML (dangerouslySetInnerHTML, innerHTML, insertAdjacentHTML, document.write)", () => {
    if (!existsSync(path)) throw new Error(`${file} absent`);
    expect(code()).not.toMatch(
      /dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write/,
    );
  });

  it("n'importe aucun composant ni bibliothèque Markdown, HTML riche ou d'assainissement", () => {
    if (!existsSync(path)) throw new Error(`${file} absent`);
    expect(code()).not.toMatch(MARKDOWN_LIBS);
    expect(code()).not.toMatch(/\bMarkdown\b|\bReactMarkdown\b/);
  });

  it("n'exécute ni n'ouvre rien à partir d'une valeur (eval, Function, window.open, location)", () => {
    if (!existsSync(path)) throw new Error(`${file} absent`);
    expect(code()).not.toMatch(
      /\beval\(|new Function\(|window\.open\(|location\.(?:href|assign|replace)\s*=/,
    );
  });

  it("n'affiche aucune image (img, Image de next) : aucune sortie du modèle ne devient une source", () => {
    if (!existsSync(path)) throw new Error(`${file} absent`);
    expect(code()).not.toMatch(/<img\b|<Image\b|next\/image/);
  });

  it("tout href est construit par l'application (projectId, chemins fixes, F-nnn validé), jamais depuis une valeur du modèle", () => {
    if (!existsSync(path)) throw new Error(`${file} absent`);
    const hrefs = Array.from(
      code().matchAll(/href=\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g),
      (m) => m[1] ?? "",
    );
    for (const expression of hrefs) {
      expect(expression, `href suspect : ${expression}`).not.toMatch(
        /\b(?:title|description|brief|value|proposal|answer|steps?|text|idea|output|openQuestions?|criteri\w+)\b/,
      );
      expect(expression, `href non maîtrisé : ${expression}`).toMatch(
        /projectId|[A-Z][A-Z_]+|specId|`\/|"\//,
      );
    }
  });
});

describe("couverture de la garde", () => {
  it("les fichiers supplémentaires du lot sont détectés (framing-* et ai-*)", () => {
    expect(extraFiles().every((file) => /(framing|ai)-/.test(file))).toBe(true);
  });
});

describe("icônes du registre (DESIGN.md §5)", () => {
  const registry = readFileSync(
    join(import.meta.dirname, "../../../packages/ui/src/icons/generated/registry.ts"),
    "utf8",
  );
  const known = new Set(Array.from(registry.matchAll(/^ {2}([a-z_]+): \(\)/gm), (m) => m[1]));

  it("toute icône nommée dans le lot existe au registre, jamais d'icône en dur", () => {
    expect(known.size).toBeGreaterThan(20);
    for (const file of ALL.filter((f) => existsSync(join(src, f)))) {
      const code = readFileSync(join(src, file), "utf8");
      for (const m of code.matchAll(/<Icon\s+name="([a-z_]+)"/g)) {
        expect(known.has(m[1]), `${file} : icône « ${m[1]} » hors registre`).toBe(true);
      }
    }
  });
});
