import {
  type GitAuth,
  type GitInstallation,
  type GitProvider,
  type GitUserCredentials,
  PROJECT_CREATION_QUEUE,
  type RepoRef,
} from "@koklo/domain";
import {
  buildInitialSpecFiles,
  type CreationAuth,
  ProvisionError,
  projectSlugOf,
  provisionSpecRepo,
  specRepoName,
} from "@koklo/github";
import type { Logger } from "@koklo/observability";
import {
  errorNameOf,
  QUEUE_DEFAULTS,
  type QueueSettings,
  TransientJobError,
  uuidFieldOf,
} from "../job-support.ts";
import { classifyCreationError } from "../project-creation/errors.ts";
import type {
  CreationInstallation,
  LoadedCreation,
  ProjectCreationStore,
} from "../project-creation/store.ts";

export { PROJECT_CREATION_QUEUE, projectCreationSingletonKey } from "@koklo/domain";

export type ProjectCreationSettings = QueueSettings;
export const PROJECT_CREATION_DEFAULTS: ProjectCreationSettings = QUEUE_DEFAULTS;

/** Job reçu de pg-boss : `retryCount` compte les reprises déjà faites. */
export interface ProjectCreationJob {
  id: string;
  data: unknown;
  retryCount: number;
}

export interface ProjectCreationDeps {
  store: ProjectCreationStore;
  /** `null` : ni App configurée ni fournisseur injecté ; les créations échouent en `provider_unavailable`. */
  provider: GitProvider | null;
  logger: Logger;
  retryLimit: number;
}

class ProjectCreationTransientError extends TransientJobError<"provider_unavailable"> {
  constructor() {
    super(PROJECT_CREATION_QUEUE, "provider_unavailable");
    this.name = "ProjectCreationTransientError";
  }
}

const gitInstallationOf = (installation: CreationInstallation): GitInstallation => ({
  id: installation.externalId,
  owner: { kind: installation.ownerKind, login: installation.ownerLogin },
});

/** Un échec de `authenticate` est rapporté comme les autres étapes du provisionnement. */
async function authenticate(
  provider: GitProvider,
  installation: CreationInstallation,
  user?: GitUserCredentials,
): Promise<GitAuth> {
  try {
    return await provider.authenticate({
      installation: gitInstallationOf(installation),
      ...(user ? { user } : {}),
    });
  } catch (error) {
    throw new ProvisionError("authenticate", error);
  }
}

/**
 * Jetons de création : pour un compte personnel, le jeton utilisateur du demandeur s'il en a un
 * (réécrit s'il a été rafraîchi) ; sans lui, le port lève `UserTokenRequiredError`. Commit et branche
 * repartent d'un jeton d'installation.
 */
async function creationAuth(
  deps: ProjectCreationDeps,
  provider: GitProvider,
  creation: LoadedCreation,
  installation: CreationInstallation,
): Promise<CreationAuth> {
  const stored =
    installation.ownerKind === "user" ? await deps.store.userCredentials(creation) : undefined;
  const write = await authenticate(provider, installation);
  if (stored === undefined) return { create: write, write };
  const create = await authenticate(provider, installation, stored);
  if (create.kind === "user" && create.token !== stored.token) {
    const { kind: _kind, ...renewed } = create;
    await deps.store.saveUserCredentials(creation, renewed);
  }
  return { create, write };
}

/** Provisionne le dépôt puis le relie au projet ; l'échec de l'écriture finale laisse un dépôt à réparer à la main. */
async function createRepo(
  deps: ProjectCreationDeps,
  provider: GitProvider,
  creation: LoadedCreation,
  installation: CreationInstallation,
): Promise<void> {
  const name = specRepoName(creation.projectName, creation.repoName);
  const ref: RepoRef = { owner: gitInstallationOf(installation).owner, name };
  const files = buildInitialSpecFiles({
    projectName: creation.projectName,
    organizationSlug: creation.organizationSlug,
    projectSlug: projectSlugOf(creation.projectName),
  });
  const auth = await creationAuth(deps, provider, creation, installation);
  const repo = await provisionSpecRepo(provider, auth, { ref, files }, (orphan, step) =>
    deps.logger.error(
      { creationId: creation.id, repo: `${orphan.owner.login}/${orphan.name}`, step },
      "project-creation : dépôt créé chez le fournisseur mais non enregistré (à réparer à la main)",
    ),
  );
  try {
    await deps.store.succeed(creation, installation, repo);
  } catch (error) {
    deps.logger.error(
      { creationId: creation.id, repo: `${ref.owner.login}/${ref.name}`, step: "insert" },
      "project-creation : dépôt créé chez le fournisseur mais non enregistré (à réparer à la main)",
    );
    throw error;
  }
}

/** Compte utilisable : actif et présent ; sinon `account_unavailable` sans appel réseau. */
const usable = (installation: CreationInstallation | null): installation is CreationInstallation =>
  installation !== null && installation.status === "active";

async function run(
  deps: ProjectCreationDeps,
  creation: LoadedCreation,
  lastAttempt: boolean,
): Promise<void> {
  const { store } = deps;
  if (await store.hasSpecCarrier(creation)) {
    await store.markSucceeded(creation);
    return;
  }
  if (creation.installation === null) {
    await store.markSkipped(creation);
    return;
  }
  const failure = (code: "account_unavailable" | "provider_unavailable") =>
    store.markFailed(creation, { code, transient: false });
  if (!usable(creation.installation)) return void (await failure("account_unavailable"));
  if (deps.provider === null) return void (await failure("provider_unavailable"));
  try {
    await createRepo(deps, deps.provider, creation, creation.installation);
  } catch (error) {
    const result = classifyCreationError(error);
    if (result.transient && !lastAttempt) {
      deps.logger.warn(
        { creationId: creation.id, code: result.code, errorName: errorNameOf(error) },
        "project-creation : panne transitoire",
      );
      await store.markPending(creation);
      throw new ProjectCreationTransientError();
    }
    deps.logger.warn(
      { creationId: creation.id, code: result.code, errorName: errorNameOf(error) },
      "project-creation : échec",
    );
    await store.markFailed(creation, result);
  }
}

/**
 * Handler du job `{ creationId }`. Tout résultat métier (succès, échec typé, compte absent) est écrit
 * sur la ligne et le job TERMINE normalement ; seule une panne transitoire, avant le dernier essai,
 * relance. Aucun secret dans la charge, les journaux ni les erreurs levées.
 */
export function createProjectCreationHandler(deps: ProjectCreationDeps) {
  return async (job: ProjectCreationJob): Promise<void> => {
    const creationId = uuidFieldOf(job.data, "creationId");
    if (creationId === undefined) {
      deps.logger.warn({ jobId: job.id }, "project-creation: payload invalide, job ignoré");
      return;
    }
    const creation = await deps.store.load(creationId);
    if (!creation || !(await deps.store.begin(creation))) return;
    await run(deps, creation, job.retryCount >= deps.retryLimit);
    deps.logger.info({ creationId }, "project-creation: création traitée");
  };
}
