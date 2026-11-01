export type FrontMatterParts = { front: string; body: string[] };

/**
 * SQUELETTE (TK-53a, étape Red) : le comportement est encore dans `feature-markdown.ts`.
 * Le Green déplace ici `splitFrontMatter` à l'identique.
 */
export function splitFrontMatter(_content: string): FrontMatterParts | undefined {
  throw new Error("splitFrontMatter : non implémenté (TK-53a Red)");
}
