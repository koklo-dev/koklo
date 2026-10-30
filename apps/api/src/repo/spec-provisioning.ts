import type { FileChange, GitAuth, GitProvider, Repo, RepoRef } from "@koklo/domain";
import { requestLogger } from "../request-logger.ts";
import type { CreationAuth } from "./git-access.ts";
import { step } from "./git-access.ts";
import type { ProviderStep } from "./provider-errors.ts";

const COMMIT_MESSAGE = "chore: initialise la spec Koklo";
/** Identité fixe du commit initial ; l'adresse réelle de l'App et le trailer des lots relèvent de TK-44. */
const BOT = { name: "Koklo", email: "koklo-bot@users.noreply.invalid" } as const;
export const SCOPING_BRANCH = "cadrage";

/** Le dépôt existe chez le fournisseur mais n'est pas enregistré : journal de réparation, sans jeton ni message brut. */
export function logOrphan(repo: RepoRef, failedStep: ProviderStep | "insert"): void {
  requestLogger().error(
    { repo: `${repo.owner.login}/${repo.name}`, step: failedStep },
    "repo.createSpec : dépôt créé chez le fournisseur mais non enregistré (à réparer à la main)",
  );
}

async function afterCreation<T>(
  repo: RepoRef,
  name: ProviderStep,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await step(name, call);
  } catch (error) {
    logOrphan(repo, name);
    throw error;
  }
}

/**
 * Trois appels au fournisseur, hors de toute transaction : dépôt privé, structure en un seul
 * commit sur la branche par défaut, puis branche `cadrage` posée sur ce commit.
 */
export async function provisionSpecRepo(
  provider: GitProvider,
  auth: CreationAuth,
  request: { ref: RepoRef; files: readonly FileChange[] },
): Promise<Repo> {
  const { ref, files } = request;
  const created = await step("createRepo", () =>
    provider.createRepo({
      auth: auth.create,
      owner: ref.owner,
      name: ref.name,
      visibility: "private",
    }),
  );
  const writer: GitAuth = auth.write;
  const commit = await afterCreation(ref, "writeCommit", () =>
    provider.writeCommit({
      auth: writer,
      repo: ref,
      branch: created.defaultBranch,
      files,
      author: BOT,
      message: COMMIT_MESSAGE,
    }),
  );
  await afterCreation(ref, "createBranch", () =>
    provider.createBranch({ auth: writer, repo: ref, base: commit.sha, name: SCOPING_BRANCH }),
  );
  return created;
}
