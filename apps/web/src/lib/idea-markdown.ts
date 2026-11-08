import type { Editor } from "@tiptap/react";

const HTML_TAG = /<\/?(?!https?:)[a-zA-Z][^>]*>/g;
const LINK = /(!?)\[([^\]]*)\]\(\s*([^)\s]*)[^)]*\)/g;
const CALLOUT = /^(>\s*)\\\[!([A-Za-z]+)\\\]/gm;

/**
 * Rend un Markdown inerte avant de le charger (ADR 0019) : le HTML brut perd ses balises (le texte reste), une image
 * devient son texte alternatif, un lien dont l'adresse n'est pas http(s) devient son texte. Rien de ce qui est
 * enregistré ne peut ensuite s'exécuter, où que le contenu soit relu.
 */
export function sanitizeIdeaMarkdown(markdown: string): string {
  return markdown
    .replace(HTML_TAG, "")
    .replace(LINK, (whole, bang: string, text: string, url: string) => {
      if (bang) return text;
      return /^https?:\/\//i.test(url) ? whole : text;
    });
}

/** Charge un Markdown (rendu inerte) dans l'éditeur, sans déclencher d'enregistrement. */
export function loadIdeaMarkdown(editor: Editor, markdown: string): void {
  editor.commands.setContent(sanitizeIdeaMarkdown(markdown), {
    contentType: "markdown",
    emitUpdate: false,
  });
}

/** Markdown du document : encadrés `> [!note]` non échappés, une seule ligne vide entre blocs, pas de blanc final. */
export function serializeIdeaMarkdown(editor: Editor): string {
  return editor
    .getMarkdown()
    .replace(CALLOUT, "$1[!$2]")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/&nbsp;/g, "")
    .trim();
}
