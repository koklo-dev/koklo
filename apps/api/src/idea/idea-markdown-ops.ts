/**
 * Opérations de bloc sur le Markdown d'une page (TK-90, B222). Le Markdown n'a pas d'identifiant de bloc : une
 * proposition vise le rang d'un bloc de premier niveau (paragraphe, titre, liste, citation, code), séparé du suivant
 * par une ligne vide. Un bloc de code clôturé reste entier même s'il contient des lignes vides. Fonctions pures.
 */
export type BlockOperationKind = "insert_after" | "replace" | "append" | "create_page";

export interface BlockOperation {
  readonly op: BlockOperationKind;
  readonly anchorBlockIndex: number | null;
  readonly rangeEnd: number | null;
  readonly contentMd: string;
}

/** L'opération ne vise aucun bloc existant, ou n'est pas une opération de bloc. */
export class IdeaOperationError extends Error {
  constructor(readonly reason: "anchor" | "range" | "op") {
    super(`Opération de bloc invalide (${reason})`);
    this.name = "IdeaOperationError";
  }
}

const FENCE = /^ {0,3}(```|~~~)/;

/** Blocs de premier niveau du contenu, sans lignes vides ni fin de ligne finale. */
export function splitBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | undefined;
  const flush = () => {
    if (current.length > 0) blocks.push(current.join("\n").trimEnd());
    current = [];
  };
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (fence === undefined && line.trim() === "") {
      flush();
      continue;
    }
    current.push(line);
    const marker = FENCE.exec(line)?.[1];
    if (marker !== undefined)
      fence = fence === undefined ? marker : fence === marker ? undefined : fence;
  }
  flush();
  return blocks;
}

export const joinBlocks = (blocks: readonly string[]): string => blocks.join("\n\n");

/** Les blocs précédés de leur rang `[n]` : ce que voit le modèle pour viser un bloc. */
export const numberedBlocks = (markdown: string): string =>
  joinBlocks(splitBlocks(markdown).map((block, rank) => `[${rank}]\n${block}`));

/** L'ancre (et sa fin) visent des blocs qui existent dans ce contenu. */
export function hasBlock(markdown: string, anchor: number, rangeEnd?: number | null): boolean {
  const count = splitBlocks(markdown).length;
  const end = rangeEnd ?? anchor;
  return Number.isInteger(anchor) && anchor >= 0 && end >= anchor && end < count;
}

function rankOf(anchor: number | null, count: number): number {
  if (anchor === null || !Number.isInteger(anchor) || anchor < 0 || anchor >= count) {
    throw new IdeaOperationError("anchor");
  }
  return anchor;
}

/** Contenu après l'opération (jamais modifié en place). `create_page` n'est pas une opération de bloc. */
export function applyBlockOperation(markdown: string, operation: BlockOperation): string {
  const blocks = splitBlocks(markdown);
  const added = splitBlocks(operation.contentMd.trim());
  switch (operation.op) {
    case "append":
      return joinBlocks([...blocks, ...added]);
    case "insert_after":
      blocks.splice(rankOf(operation.anchorBlockIndex, blocks.length) + 1, 0, ...added);
      return joinBlocks(blocks);
    case "replace": {
      const start = rankOf(operation.anchorBlockIndex, blocks.length);
      const end = operation.rangeEnd ?? start;
      if (end < start || end >= blocks.length) throw new IdeaOperationError("range");
      blocks.splice(start, end - start + 1, ...added);
      return joinBlocks(blocks);
    }
    default:
      throw new IdeaOperationError("op");
  }
}
