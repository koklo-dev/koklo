import { GitNotFoundError, type GitProvider } from "@koklo/domain";
import { ORPCError } from "@orpc/server";
import type { GitAccess } from "../repo/git-access.ts";
import { mapProviderError } from "../repo/provider-errors.ts";

/** Où lire la spec dans git : dossier de la spec (monorepo) ou `null`, dépôt, propriétaire et installation. */
export interface SpecGitTarget {
  specPath: string | null;
  repoName: string;
  owner: { kind: "organization" | "user"; login: string };
  installation: { id: string; externalId: string; active: boolean };
}

/**
 * Chemins de la spec sur la branche du lot (TK-114e, B671, B676), relatifs à son dossier : l'arbre git frais, pas l'index
 * d'entités (en retard possible). Branche absente : `null` (pas de pré-vérification). Sans fournisseur utilisable, ou en
 * panne : erreur typée habituelle de `submit`, jamais le texte du fournisseur. Hors transaction.
 */
export async function specHeadPaths(
  provider: GitProvider | null,
  access: Pick<GitAccess, "installationAuth">,
  target: SpecGitTarget,
  branch: string,
): Promise<string[] | null> {
  if (provider === null || !target.installation.active) {
    throw new ORPCError("PROVIDER_UNAVAILABLE");
  }
  const auth = await access.installationAuth(provider, {
    id: target.installation.id,
    externalId: target.installation.externalId,
    ownerKind: target.owner.kind,
    ownerLogin: target.owner.login,
  });
  const repo = { owner: target.owner, name: target.repoName };
  let listing: Awaited<ReturnType<GitProvider["listFiles"]>>;
  try {
    listing = await provider.listFiles({ auth, repo, ref: branch });
  } catch (error) {
    if (error instanceof GitNotFoundError) return null;
    throw mapProviderError(error, "readFile");
  }
  const prefix = target.specPath === null ? "" : `${target.specPath}/`;
  return listing.files
    .map((file) => file.path)
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length));
}
