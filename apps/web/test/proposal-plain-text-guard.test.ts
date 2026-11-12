import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde d'architecture « texte brut » (B330, reprise de l'Assistant de cadrage retiré en TK-102) : aucun fichier de
 * la relecture des propositions de l'agent ne rend du HTML ni du Markdown, aucun lien ne vient d'une sortie du modèle.
 */
const src = join(import.meta.dirname, "../src");

const FILES = [
  "components/ai-send-policy.tsx",
  "components/ai-error-notice.tsx",
  "lib/ai-errors.ts",
  "lib/use-ai-call.ts",
  "components/features-propose.tsx",
  "components/features-review.tsx",
  "components/features-review-detail.tsx",
  "components/proposal-editor.tsx",
  "components/proposal-criteria-editor.tsx",
  "components/proposal-issues.tsx",
  "lib/proposal-edit.ts",
  "lib/proposal-ids.ts",
  "lib/proposal-labels.ts",
  "lib/proposal-operations.ts",
  "lib/proposal-types.ts",
  "lib/proposal-validation.ts",
  "lib/use-proposal-actions.ts",
  "lib/use-proposal-launch.ts",
  "lib/use-proposal-review.ts",
  "lib/use-proposal-save.ts",
  "lib/use-proposal-status.ts",
];

/** Tout fichier `ai-*` ou `proposal-*` ajouté plus tard est contrôlé aussi. */
function extraFiles(): string[] {
  const found: string[] = [];
  for (const dir of ["components", "lib"]) {
    for (const name of readdirSync(join(src, dir))) {
      if (/^(?:use-)?(?:ai|proposal)-.*\.tsx?$/.test(name)) found.push(`${dir}/${name}`);
    }
  }
  return found.filter((file) => !FILES.includes(file));
}
const ALL = [...FILES, ...extraFiles()];

const MARKDOWN_LIBS =
  /\b(?:react-markdown|marked|markdown-it|remark|rehype|micromark|mdx|showdown|snarkdown|dompurify|sanitize-html|highlight\.js)\b/i;

describe.each(ALL)("%s", (file) => {
  const path = join(src, file);
  const code = () => readFileSync(path, "utf8");

  it("existe", () => {
    expect(existsSync(path), `${file} absent`).toBe(true);
  });

  it("ne construit aucun HTML (dangerouslySetInnerHTML, innerHTML, insertAdjacentHTML, document.write)", () => {
    expect(code()).not.toMatch(
      /dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write/,
    );
  });

  it("n'importe aucun composant ni bibliothèque Markdown, HTML riche ou d'assainissement", () => {
    expect(code()).not.toMatch(MARKDOWN_LIBS);
    expect(code()).not.toMatch(/\bMarkdown\b|\bReactMarkdown\b/);
  });

  it("n'exécute ni n'ouvre rien à partir d'une valeur (eval, Function, window.open, location)", () => {
    expect(code()).not.toMatch(
      /\beval\(|new Function\(|window\.open\(|location\.(?:href|assign|replace)\s*=/,
    );
  });

  it("n'affiche aucune image (img, Image de next) : aucune sortie du modèle ne devient une source", () => {
    expect(code()).not.toMatch(/<img\b|<Image\b|next\/image/);
  });

  it("tout href est construit par l'application (projectId, chemins fixes, ancre locale, F-nnn validé), jamais depuis une valeur du modèle", () => {
    const hrefs = Array.from(
      code().matchAll(/href=\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g),
      (m) => m[1] ?? "",
    );
    for (const expression of hrefs) {
      expect(expression, `href suspect : ${expression}`).not.toMatch(
        /\b(?:title|description|brief|value|proposal|answer|steps?|text|idea|output|openQuestions?|criteri\w+)\b/,
      );
      expect(expression, `href non maîtrisé : ${expression}`).toMatch(
        /projectId|[A-Z][A-Z_]+|specId|`[/#]|"[/#]/,
      );
    }
  });
});

describe("couverture de la garde", () => {
  it("les fichiers supplémentaires sont détectés (ai-* et proposal-*)", () => {
    expect(extraFiles().every((file) => /(ai|proposal)-/.test(file))).toBe(true);
  });
});
