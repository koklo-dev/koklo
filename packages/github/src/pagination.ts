import { GitProviderError } from "@koklo/domain";

export const PAGE_SIZE = 100;

type Iterator<T> = AsyncIterable<{ data: T[]; headers: { link?: string | undefined } }>;

/**
 * Lit toutes les pages d'une liste (100 par page) avec une borne de sécurité : au-delà de
 * `maxPages` pages avec une suite, échec explicite plutôt que troncature silencieuse (H5).
 * Le port ne voit jamais de pagination.
 */
export async function collectPages<T>(
  pages: Iterator<T>,
  operation: string,
  maxPages: number,
): Promise<T[]> {
  const items: T[] = [];
  let read = 0;
  for await (const page of pages) {
    read += 1;
    items.push(...page.data);
    if (read >= maxPages && /rel="next"/.test(page.headers.link ?? "")) {
      throw new GitProviderError(
        operation,
        `Liste Git trop longue (plus de ${maxPages} pages) : opération ${operation} interrompue.`,
      );
    }
  }
  return items;
}
