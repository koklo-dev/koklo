import type { GitAuth, GitProvider, RepoRef } from "@koklo/domain";
import { isFlowPath, kindOf, type SpecFile } from "@koklo/schema";
import { READ_CONCURRENCY } from "../spec-write/constants.ts";
import { relativeToSpec, withSpecPath } from "../spec-write/paths.ts";

/** Une tête listée par le port : le ref résolu (SHA) et les fichiers de l'arbre. */
export interface SpecListing {
  readonly ref: string;
  readonly files: readonly { path: string }[];
}

export type ReadSpecInput = {
  readonly provider: GitProvider;
  readonly auth: GitAuth;
  readonly repo: RepoRef;
  readonly listing: SpecListing;
  /** Dossier de la spec dans un monorepo, `null` quand la spec est à la racine. */
  readonly specPath: string | null;
  /** Lire aussi les parcours `design/flows/P-*.json` (indexeur d'entités, TK-100) ; faux pour l'écriture de lots. */
  readonly flows?: boolean;
};

/** Chemins (relatifs à la racine de la spec) des fichiers que le schéma reconnaît. */
export function recognizedSpecPaths(
  specPath: string | null,
  files: readonly { path: string }[],
  options: { flows?: boolean } = {},
): string[] {
  return files.flatMap((file) => {
    const path = relativeToSpec(specPath, file.path);
    if (path === undefined) return [];
    const known = kindOf(path) !== undefined || (options.flows === true && isFlowPath(path));
    return known ? [path] : [];
  });
}

/**
 * Lit les fichiers reconnus de la spec à la tête listée : lectures bornées (`READ_CONCURRENCY`),
 * chemins rendus relatifs à la racine de la spec, lecture au SHA résolu du listage. Une panne du
 * fournisseur est propagée telle quelle (le job la classe). Seule implémentation de la lecture.
 */
export async function readSpecFiles({
  provider,
  auth,
  repo,
  listing,
  specPath,
  flows,
}: ReadSpecInput): Promise<SpecFile[]> {
  const paths = recognizedSpecPaths(specPath, listing.files, { flows });
  const files: SpecFile[] = [];
  for (let start = 0; start < paths.length; start += READ_CONCURRENCY) {
    const chunk = paths.slice(start, start + READ_CONCURRENCY);
    const read = await Promise.all(
      chunk.map((path) =>
        provider.readFile({ auth, repo, ref: listing.ref, path: withSpecPath(specPath, path) }),
      ),
    );
    for (const [index, path] of chunk.entries()) {
      files.push({ path, content: read[index]?.content ?? "" });
    }
  }
  return files;
}
