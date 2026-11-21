import type { SpecOperation } from "@koklo/contract";
import type { DocSection } from "./use-architecture-document.ts";

/**
 * Lecture du document d'architecture (maquette 13 l.273-325, 750-800) : sections ordonnées par leur préfixe NN, rendu
 * en blocs de texte brut (jamais de balise ni de lien : le Markdown vient de l'agent ou d'un humain, rien n'est
 * interprété), manques de la colonne Agent.
 */
export type MarkdownBlock =
  | { kind: "h"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] };

const HEADING = /^#{1,6}\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;

/** Titres (`#`), puces (`- `) et paragraphes ; les puces consécutives forment une seule liste. */
export function markdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = BULLET.exec(line)?.[1];
    const heading = HEADING.exec(line)?.[1];
    const last = blocks.at(-1);
    if (bullet !== undefined) {
      if (last?.kind === "ul") last.items.push(bullet);
      else blocks.push({ kind: "ul", items: [bullet] });
    } else if (heading !== undefined) blocks.push({ kind: "h", text: heading });
    else blocks.push({ kind: "p", text: line });
  }
  return blocks;
}

/** « 03 » : le numéro du fichier `architecture/overview/NN-<slug>.md`. */
export const sectionNumber = (num: number): string => String(num).padStart(2, "0");

/** Section ouverte : celle de `?s=`, sinon la première (l'ordre est celui du serveur). */
export const selectedSectionOf = (
  sections: readonly DocSection[],
  slug: string | undefined,
): DocSection | undefined => sections.find((section) => section.slug === slug) ?? sections[0];

/** « Ce qui manque encore » : une ligne par section à rédiger. */
export const docGapsOf = (sections: readonly DocSection[]): string[] =>
  sections
    .filter((section) => section.status === "a_rediger")
    .map((section) => `${section.title} : section vide.`);

/** « Marquer comme validée » : le statut seul change, dans le front matter de la section. */
export const markValidatedOperation = (specId: string): SpecOperation => ({
  kind: "doc.section.update",
  specId,
  status: "validee",
});
