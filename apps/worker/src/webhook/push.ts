import {
  type GitAuth,
  GitNotFoundError,
  type GitProvider,
  isValidBranchName,
  type RepoRef,
} from "@koklo/domain";
import type { Logger } from "@koklo/observability";
import { parseSpecFiles, type SpecFile } from "@koklo/schema";
import { readSpecFiles, recognizedSpecPaths } from "../spec-read/read-spec.ts";
import { MAX_SPEC_FILES } from "./index-rows.ts";
import type { IndexWriter, SnapshotWrite } from "./index-writer.ts";
import type { TargetStore } from "./target-store.ts";
import {
  type DeliveryOutcome,
  failedWith,
  ignored,
  type PushJob,
  processed,
  type Target,
} from "./types.ts";

export interface PushDeps {
  readonly targets: TargetStore;
  readonly writer: IndexWriter;
  /** `null` : ni App configurée ni fournisseur injecté ; la livraison échoue en `provider_unavailable`. */
  readonly provider: GitProvider | null;
  readonly logger: Logger;
}

const BRANCH_PREFIX = "refs/heads/";

/** Nom de branche d'un ref `refs/heads/<nom>` valable pour le fournisseur, sinon `undefined`. */
function branchOf(ref: string): string | undefined {
  if (!ref.startsWith(BRANCH_PREFIX)) return undefined;
  const name = ref.slice(BRANCH_PREFIX.length);
  return isValidBranchName(name) ? name : undefined;
}

/** Un dépôt porte une spec s'il a le rôle `spec` ou un dossier de spec (monorepo) ; le code relève de R3+. */
const carriesSpec = (target: Target): boolean =>
  target.repo.role === "spec" || target.repo.specPath !== null;

/** `GitNotFoundError` d'une branche (et non du dépôt) : la branche a disparu. */
const isMissingRef = (error: unknown): boolean =>
  error instanceof GitNotFoundError && error.resource === "ref";

/**
 * Tête de la branche lue à l'exécution, jamais le `after` de la charge ni le drapeau `deleted` :
 * c'est ce qui rend l'ordre des livraisons sans importance. Rend `undefined` si la branche n'existe
 * plus. Le 404 « ref » de l'adaptateur réel couvre aussi un dépôt supprimé, transféré ou dont
 * l'accès est retiré : le dépôt est donc vérifié (`getRepo`) avant de conclure à une branche
 * supprimée ; son 404 « repository » remonte et devient `failed / repo_not_found`, tête inchangée.
 */
async function listHead(provider: GitProvider, auth: GitAuth, repo: RepoRef, branch: string) {
  try {
    return await provider.listFiles({ auth, repo, ref: branch });
  } catch (error) {
    if (!isMissingRef(error)) throw error;
    await provider.getRepo({ auth, repo });
    return undefined;
  }
}

/** Analyse les fichiers lus : les fichiers invalides sont comptés, jamais bloquants. */
function parsedSnapshot(deps: PushDeps, files: readonly SpecFile[]): SnapshotWrite {
  const { spec, issues } = parseSpecFiles(files);
  deps.logger.info(
    { files: files.length, issues: issues.length },
    "webhook-delivery: spec analysée",
  );
  return { status: "ready", spec };
}

async function indexHead(
  deps: PushDeps,
  provider: GitProvider,
  target: Target,
  branch: string,
): Promise<DeliveryOutcome> {
  const { installation, repo } = target;
  const auth = await provider.authenticate({
    installation: {
      id: installation.externalId,
      owner: { kind: installation.ownerKind, login: installation.ownerLogin },
    },
  });
  const ref: RepoRef = {
    owner: { kind: installation.ownerKind, login: repo.ownerLogin },
    name: repo.name,
  };
  const listing = await listHead(provider, auth, ref, branch);
  if (listing === undefined) {
    await deps.targets.deleteHead(target, branch);
    return processed();
  }
  const known = await deps.targets.snapshotOf(repo.id, listing.ref);
  if (known?.status === "ready") {
    await deps.targets.moveHead(target, branch, known.id);
    return processed();
  }
  if (recognizedSpecPaths(repo.specPath, listing.files).length > MAX_SPEC_FILES) {
    await deps.writer.write(target, branch, listing.ref, {
      status: "failed",
      errorCode: "spec_too_large",
    });
    return failedWith("spec_too_large");
  }
  const files = await readSpecFiles({
    provider,
    auth,
    repo: ref,
    listing,
    specPath: repo.specPath,
  });
  const result = await deps.writer.write(target, branch, listing.ref, parsedSnapshot(deps, files));
  if (result.counterSkipped > 0) {
    deps.logger.warn(
      { ignoredIds: result.counterSkipped },
      "webhook-delivery: identifiants de feature hors plafond, compteur non relevé",
    );
  }
  return processed();
}

/**
 * Reconstruit l'index d'un `push`. Une exception signifie une panne à classer (transitoire ou
 * dépôt introuvable) ; tout autre résultat est métier et rendu tel quel.
 */
export async function handlePush(deps: PushDeps, push: PushJob): Promise<DeliveryOutcome> {
  const branch = branchOf(push.ref);
  if (branch === undefined) return ignored();
  const resolution = await deps.targets.resolve(push.installationId, push.repositoryId);
  if (resolution.kind === "unknown-installation") return ignored("unknown_installation");
  if (resolution.kind === "unknown-repo") return ignored("unknown_repo");
  const { target } = resolution;
  if (target.installation.status !== "active" || !carriesSpec(target)) return ignored();
  if (deps.provider === null) return failedWith("provider_unavailable");
  return indexHead(deps, deps.provider, target, branch);
}
