import type { GitAuth, GitProvider, RepoRef } from "@koklo/domain";
import {
  isFlowPath,
  isTableDirPath,
  kindOf,
  MIGRATION_EXTRA_PATHS,
  type SpecFile,
} from "@koklo/schema";
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
  /** Lire aussi les fichiers que la migration v1 -> v2 déplace ou crée (règles de design, sections) : lots de migration seulement. */
  readonly migration?: boolean;
};

/** Chemins (relatifs à la racine de la spec) des fichiers que le schéma reconnaît ou signale. */
export function recognizedSpecPaths(
  specPath: string | null,
  files: readonly { path: string }[],
  options: { flows?: boolean; migration?: boolean } = {},
): string[] {
  return files.flatMap((file) => {
    const path = relativeToSpec(specPath, file.path);
    if (path === undefined) return [];
    // Les fichiers de `data/tables/` hors format sont lus aussi : le schéma les signale (STRUCT_UNKNOWN_TABLE_FILE).
    const known =
      kindOf(path) !== undefined ||
      isTableDirPath(path) ||
      (options.flows === true && isFlowPath(path)) ||
      (options.migration === true && MIGRATION_EXTRA_PATHS.includes(path));
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
  migration,
}: ReadSpecInput): Promise<SpecFile[]> {
  const paths = recognizedSpecPaths(specPath, listing.files, { flows, migration });
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
