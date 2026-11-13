import {
  type FileChange,
  type GitAuth,
  GitConflictError,
  type GitProvider,
  KOKLO_BOT_AUTHOR,
  type RepoRef,
} from "@koklo/domain";
import type { SpecFile } from "@koklo/schema";
import { readSpecFiles } from "../spec-read/read-spec.ts";
import { RECOVERY_WINDOW } from "./constants.ts";
import { ideaTagOf } from "./idea-payload.ts";
import { buildCommitMessage, hasOpsTrailer } from "./message.ts";
import { isMigrationKind, migrationBatchIdOf, relativeToSpec, withSpecPath } from "./paths.ts";
import { planBatch } from "./plan.ts";
import {
  type BatchAuthor,
  type CommittedOutcome,
  conflicted,
  failed,
  type LoadedBatch,
  type Outcome,
} from "./types.ts";

interface Target {
  readonly provider: GitProvider;
  readonly auth: GitAuth;
  readonly repo: RepoRef;
  readonly batch: LoadedBatch;
  /** Contributeurs d'une publication d'idée, en plus de l'auteur de la session. */
  readonly coAuthors: readonly BatchAuthor[];
  /** Appelé juste avant `writeCommit` : à partir de là, une écriture a pu partir. */
  readonly beforeWrite: () => Promise<void>;
}

/**
 * Reprise après un crash entre le commit et la base : le trailer `Koklo-Ops: <batchId>` est cherché
 * dans les 50 derniers commits de la branche. Trouvé : le lot est déjà commité. Absent : si le lot
 * avait été pris et que la fenêtre est pleine, on ne sait PAS s'il est commité (jamais « non
 * commité ») : échec sans recommit ; sinon l'historique est lu en entier, on exécute normalement.
 */
async function recover({ provider, auth, repo, batch }: Target): Promise<Outcome | undefined> {
  const commits = await provider.listCommits({
    auth,
    repo,
    ref: batch.branch,
    limit: RECOVERY_WINDOW,
  });
  const found = commits.find((commit) => hasOpsTrailer(commit.message, batch.id));
  if (found) return { status: "committed", commitSha: found.sha };
  const unknown = batch.status === "committing" && commits.length >= RECOVERY_WINDOW;
  return unknown ? failed("INTERNAL") : undefined;
}

/**
 * Retour arrière d'une migration : fichiers de la spec au PARENT du commit du lot visé (retrouvé par son trailer, dans la
 * fenêtre de 50 commits). `undefined` : commit ou parent introuvable, le plan rend alors une erreur interne.
 */
async function parentFilesOf(target: Target): Promise<SpecFile[] | undefined> {
  const { provider, auth, repo, batch } = target;
  const migrated = migrationBatchIdOf(batch.operations[0]?.payload ?? {});
  if (batch.operations[0]?.kind !== "spec.migrate.revert" || migrated === undefined)
    return undefined;
  const commits = await provider.listCommits({
    auth,
    repo,
    ref: batch.branch,
    limit: RECOVERY_WINDOW,
  });
  const index = commits.findIndex((commit) => hasOpsTrailer(commit.message, migrated));
  const parent = index < 0 ? undefined : commits[index + 1];
  if (parent === undefined) return undefined;
  const listing = await provider.listFiles({ auth, repo, ref: parent.sha });
  return readSpecFiles({
    provider,
    auth,
    repo,
    listing,
    specPath: batch.repo.specPath,
    migration: true,
  });
}

const prefixed = (specPath: string | null, change: FileChange): FileChange =>
  change.delete === true
    ? { path: withSpecPath(specPath, change.path), delete: true }
    : { path: withSpecPath(specPath, change.path), content: change.content };

/** Une passe : tête, base attendue, état, plan, UN commit gardé par la tête lue. */
async function attempt(target: Target, author: BatchAuthor | null): Promise<Outcome> {
  const { provider, auth, repo, batch } = target;
  const listing = await provider.listFiles({ auth, repo, ref: batch.branch });
  if (batch.baseSha !== null && batch.baseSha !== listing.ref) return conflicted("stale_base");
  const migration = batch.operations.some((operation) => isMigrationKind(operation.kind));
  const files = await readSpecFiles({
    provider,
    auth,
    repo,
    listing,
    specPath: batch.repo.specPath,
    migration,
  });
  const treePaths = listing.files.flatMap((file) => {
    const path = relativeToSpec(batch.repo.specPath, file.path);
    return path === undefined ? [] : [path];
  });
  const plan = planBatch(
    batch,
    files,
    treePaths,
    migration ? await parentFilesOf(target) : undefined,
  );
  if ("outcome" in plan) return plan.outcome;
  await target.beforeWrite();
  const commit = await provider.writeCommit({
    auth,
    repo,
    branch: batch.branch,
    files: plan.changes.map((change) => prefixed(batch.repo.specPath, change)),
    author: KOKLO_BOT_AUTHOR,
    message: buildCommitMessage({
      batchId: batch.id,
      message: batch.message,
      operations: batch.operations,
      author,
      coAuthors: target.coAuthors,
    }),
    expectedHeadSha: listing.ref,
  });
  return plan.report
    ? { status: "committed", commitSha: commit.sha, report: plan.report }
    : { status: "committed", commitSha: commit.sha };
}

const isStaleHead = (error: unknown): boolean =>
  error instanceof GitConflictError && error.reason === "stale-sha";

/** Reprise, puis lecture-plan-commit, rejouée UNE fois si la tête a bougé entre la lecture et l'écriture. */
async function commitBatch(target: Target, author: BatchAuthor | null): Promise<Outcome> {
  const recovered = await recover(target);
  if (recovered) return recovered;
  try {
    return await attempt(target, author);
  } catch (error) {
    if (!isStaleHead(error)) throw error;
    return attempt(target, author);
  }
}

const isTagExists = (error: unknown): boolean =>
  error instanceof GitConflictError && error.reason === "exists";

/**
 * Tag `idea-vN` d'un lot de passage au cadrage (TK-91), posé APRÈS le commit, y compris sur le chemin de reprise :
 * un job rejoué entre le commit et le tag le pose sans recommiter. Un tag déjà présent sur le même commit est un
 * succès ; sur un autre commit, un conflit (jamais déplacé) ; une panne est levée et le job rejoue.
 */
async function tagVersion(target: Target, outcome: CommittedOutcome): Promise<Outcome> {
  const name = ideaTagOf(target.batch.operations);
  if (name === undefined) return outcome;
  const { provider, auth, repo } = target;
  try {
    await provider.createTag({ auth, repo, ref: outcome.commitSha, name });
  } catch (error) {
    if (!isTagExists(error)) throw error;
    const [pointed] = await provider.listCommits({ auth, repo, ref: name, limit: 1 });
    if (pointed?.sha !== outcome.commitSha) return conflicted("write_conflict");
  }
  return outcome;
}

/**
 * `beforeWrite` pose le lot en `committing` juste avant `writeCommit` (jamais avant la lecture de
 * l'état) : une panne transitoire en lecture laisse le lot `queued`, rejouable sans « sort inconnu ».
 * Exécute un lot hors de toute transaction : reprise, puis lecture-plan-commit, puis le tag éventuel.
 * Rend le résultat métier ; une panne du fournisseur est levée telle quelle (le job la classe :
 * transitoire ou métier).
 */
export async function executeBatch(
  provider: GitProvider,
  batch: LoadedBatch,
  author: BatchAuthor | null,
  beforeWrite: () => Promise<void>,
  coAuthors: readonly BatchAuthor[] = [],
): Promise<Outcome> {
  const { externalId, ownerKind, ownerLogin } = batch.installation;
  const auth = await provider.authenticate({
    installation: { id: externalId, owner: { kind: ownerKind, login: ownerLogin } },
  });
  const repo = { owner: { kind: ownerKind, login: batch.repo.ownerLogin }, name: batch.repo.name };
  const target: Target = { provider, auth, repo, batch, coAuthors, beforeWrite };
  const outcome = await commitBatch(target, author);
  return outcome.status === "committed" ? tagVersion(target, outcome) : outcome;
}
