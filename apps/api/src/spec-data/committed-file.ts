import { GitNotFoundError } from "@koklo/domain";
import type { GitAccess } from "../repo/git-access.ts";
import { mapProviderError } from "../repo/provider-errors.ts";
import type { GitProviderBinding } from "../repo/tokens.ts";
import type { GitSource } from "./spec-data.repository.ts";

/**
 * Fichier de la spec au commit indexé (Données et Architecture) ; `undefined` : absent du dépôt, ou aucun fournisseur
 * utilisable. Lu hors transaction : le commit et le dépôt viennent de l'index, le réseau n'est touché qu'ensuite.
 */
export async function readCommittedFile(
  provider: GitProviderBinding,
  access: GitAccess,
  source: GitSource,
  file: string,
): Promise<string | undefined> {
  if (provider === null || !source.installation.active) return undefined;
  const auth = await access.installationAuth(provider, {
    id: source.installation.id,
    externalId: source.installation.externalId,
    ownerKind: source.owner.kind,
    ownerLogin: source.owner.login,
  });
  const path = source.specPath === null ? file : `${source.specPath}/${file}`;
  try {
    const read = await provider.readFile({
      auth,
      repo: { owner: source.owner, name: source.repoName },
      ref: source.commitSha,
      path,
    });
    return read.content;
  } catch (error) {
    if (error instanceof GitNotFoundError) return undefined;
    throw mapProviderError(error, "readFile");
  }
}
