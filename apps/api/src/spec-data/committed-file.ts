import {
  type GitAuth,
  GitNotFoundError,
  type GitOwner,
  type GitProvider,
  GitProviderError,
  type RepoRef,
} from "@koklo/domain";
import { cachedGitReads, type GitReadCache } from "@koklo/github";
import type { GitAccess } from "../repo/git-access.ts";
import { mapProviderError } from "../repo/provider-errors.ts";
import type { GitProviderBinding } from "../repo/tokens.ts";

/** Ce qu'un lecteur git de l'API sait de la source indexée (dépôt, installation, commit). */
export interface CommittedSource {
  readonly installation: {
    readonly id: string;
    readonly externalId: string;
    readonly active: boolean;
  };
  readonly owner: GitOwner;
  readonly repoName: string;
  readonly specPath: string | null;
  readonly commitSha: string;
}

/** Lecteur au commit indexé : `reads` passe par le cache de l'installation, `at` porte jeton, dépôt et SHA. */
export interface CommittedReads {
  readonly reads: GitProvider;
  readonly at: { readonly auth: GitAuth; readonly repo: RepoRef; readonly ref: string };
}

/**
 * Jeton d'installation puis lectures en cache, dans cet ordre (B693) : l'appelant a vérifié l'index sous `ProjectScope` et
 * `installation.active` ; la portée du cache est l'installation Koklo de la source (B688).
 */
export async function committedReads(
  provider: GitProvider,
  access: GitAccess,
  cache: GitReadCache,
  source: CommittedSource,
): Promise<CommittedReads> {
  const auth = await access.installationAuth(provider, {
    id: source.installation.id,
    externalId: source.installation.externalId,
    ownerKind: source.owner.kind,
    ownerLogin: source.owner.login,
  });
  return {
    reads: cachedGitReads(provider, cache, { installationId: source.installation.id }),
    at: { auth, repo: { owner: source.owner, name: source.repoName }, ref: source.commitSha },
  };
}

/** Chemin git d'un fichier relatif à la spec. */
export const specFilePath = (source: Pick<CommittedSource, "specPath">, file: string): string =>
  source.specPath === null ? file : `${source.specPath}/${file}`;

/** Arbre trop gros (liste tronquée) : erreur non typée de `listFiles`, on lit alors le fichier sans arbre. */
const isUnlistable = (error: unknown): boolean =>
  error instanceof GitProviderError &&
  error.constructor === GitProviderError &&
  error.operation === "listFiles";

/** Range l'arbre du commit (un chemin absent ne coûte alors aucun appel), sauf arbre non listable. */
async function warmTree({ reads, at }: CommittedReads): Promise<void> {
  try {
    await reads.listFiles(at);
  } catch (error) {
    if (!isUnlistable(error)) throw error;
  }
}

/**
 * Fichier de la spec au commit indexé (Données et Architecture) ; `undefined` : absent du dépôt, ou aucun fournisseur
 * utilisable. Lu hors transaction : le commit et le dépôt viennent de l'index, le réseau n'est touché qu'ensuite.
 */
export async function readCommittedFile(
  provider: GitProviderBinding,
  access: GitAccess,
  cache: GitReadCache,
  source: CommittedSource,
  file: string,
): Promise<string | undefined> {
  if (provider === null || !source.installation.active) return undefined;
  const committed = await committedReads(provider, access, cache, source);
  try {
    await warmTree(committed);
    const read = await committed.reads.readFile({
      ...committed.at,
      path: specFilePath(source, file),
    });
    return read.content;
  } catch (error) {
    if (error instanceof GitNotFoundError) return undefined;
    throw mapProviderError(error, "readFile");
  }
}
