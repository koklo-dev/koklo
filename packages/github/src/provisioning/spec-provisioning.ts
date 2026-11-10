import {
  type FileWrite,
  type GitAuth,
  type GitProvider,
  KOKLO_BOT_AUTHOR,
  type Repo,
  type RepoRef,
  SCOPING_BRANCH,
} from "@koklo/domain";

const COMMIT_MESSAGE = "chore: initialise la spec Koklo";

/** Opération du port qui a échoué : le même conflit n'a pas le même sens selon l'étape. */
export type ProviderStep =
  | "authenticate"
  | "createRepo"
  | "getRepo"
  | "readFile"
  | "writeCommit"
  | "createBranch";

/** Jetons nécessaires à la création d'un dépôt : `create` (utilisateur si disponible) puis `write`. */
export interface CreationAuth {
  create: GitAuth;
  write: GitAuth;
}

/**
 * Échec d'une étape du provisionnement. `cause` est l'erreur du port, intacte : l'API la traduit en
 * erreur typée du contrat, le worker en code de création. Aucun message du fournisseur ne sort ici.
 */
export class ProvisionError extends Error {
  readonly step: ProviderStep;
  override readonly cause: unknown;
  constructor(step: ProviderStep, cause: unknown) {
    super(`Provisionnement du dépôt de spec : échec à l'étape ${step}`);
    this.name = "ProvisionError";
    this.step = step;
    this.cause = cause;
  }
}

/** Appelé quand le dépôt existe chez le fournisseur mais que la suite a échoué : journal de réparation. */
export type OrphanReporter = (repo: RepoRef, failedStep: ProviderStep) => void;

async function run<T>(name: ProviderStep, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw new ProvisionError(name, error);
  }
}

async function afterCreation<T>(
  repo: RepoRef,
  name: ProviderStep,
  call: () => Promise<T>,
  onOrphan: OrphanReporter | undefined,
): Promise<T> {
  try {
    return await run(name, call);
  } catch (error) {
    onOrphan?.(repo, name);
    throw error;
  }
}

/**
 * Trois appels au fournisseur, hors de toute transaction : dépôt privé, structure en un seul
 * commit sur la branche par défaut, puis branche `cadrage` posée sur ce commit. Toute panne lève
 * `ProvisionError` (étape + erreur du port) ; après `createRepo`, `onOrphan` signale le dépôt à réparer.
 */
export async function provisionSpecRepo(
  provider: GitProvider,
  auth: CreationAuth,
  request: { ref: RepoRef; files: readonly FileWrite[] },
  onOrphan?: OrphanReporter,
): Promise<Repo> {
  const { ref, files } = request;
  const created = await run("createRepo", () =>
    provider.createRepo({
      auth: auth.create,
      owner: ref.owner,
      name: ref.name,
      visibility: "private",
    }),
  );
  const writer: GitAuth = auth.write;
  const commit = await afterCreation(
    ref,
    "writeCommit",
    () =>
      provider.writeCommit({
        auth: writer,
        repo: ref,
        branch: created.defaultBranch,
        files,
        author: KOKLO_BOT_AUTHOR,
        message: COMMIT_MESSAGE,
      }),
    onOrphan,
  );
  await afterCreation(
    ref,
    "createBranch",
    () =>
      provider.createBranch({ auth: writer, repo: ref, base: commit.sha, name: SCOPING_BRANCH }),
    onOrphan,
  );
  return created;
}
