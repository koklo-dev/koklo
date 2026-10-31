import {
  type FileChange,
  type GitAuth,
  GitConflictError,
  type GitProvider,
  KOKLO_BOT_AUTHOR,
  type RepoRef,
} from "@koklo/domain";
import { kindOf, type SpecFile } from "@koklo/schema";
import { READ_CONCURRENCY, RECOVERY_WINDOW } from "./constants.ts";
import { buildCommitMessage, hasOpsTrailer } from "./message.ts";
import { relativeToSpec, withSpecPath } from "./paths.ts";
import { planBatch } from "./plan.ts";
import { type BatchAuthor, conflicted, failed, type LoadedBatch, type Outcome } from "./types.ts";

interface Target {
  readonly provider: GitProvider;
  readonly auth: GitAuth;
  readonly repo: RepoRef;
  readonly batch: LoadedBatch;
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

/** Lit les fichiers reconnus de la spec à la tête listée (lectures bornées, chemins relatifs). */
async function readSpec(
  { provider, auth, repo, batch }: Target,
  listing: { ref: string; files: readonly { path: string }[] },
): Promise<SpecFile[]> {
  const paths = listing.files.flatMap((file) => {
    const path = relativeToSpec(batch.repo.specPath, file.path);
    return path !== undefined && kindOf(path) !== undefined ? [path] : [];
  });
  const files: SpecFile[] = [];
  for (let start = 0; start < paths.length; start += READ_CONCURRENCY) {
    const chunk = paths.slice(start, start + READ_CONCURRENCY);
    const read = await Promise.all(
      chunk.map((path) =>
        provider.readFile({
          auth,
          repo,
          ref: listing.ref,
          path: withSpecPath(batch.repo.specPath, path),
        }),
      ),
    );
    for (const [index, path] of chunk.entries()) {
      files.push({ path, content: read[index]?.content ?? "" });
    }
  }
  return files;
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
  const plan = planBatch(batch, await readSpec(target, listing));
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
    }),
    expectedHeadSha: listing.ref,
  });
  return plan.report
    ? { status: "committed", commitSha: commit.sha, report: plan.report }
    : { status: "committed", commitSha: commit.sha };
}

const isStaleHead = (error: unknown): boolean =>
  error instanceof GitConflictError && error.reason === "stale-sha";

/**
 * `beforeWrite` pose le lot en `committing` juste avant `writeCommit` (jamais avant la lecture de
 * l'état) : une panne transitoire en lecture laisse le lot `queued`, rejouable sans « sort inconnu ».
 * Exécute un lot hors de toute transaction : reprise, puis lecture-plan-commit, rejouée UNE fois
 * si la tête a bougé entre la lecture et l'écriture. Rend le résultat métier ; une panne du
 * fournisseur est levée telle quelle (le job la classe : transitoire ou métier).
 */
export async function executeBatch(
  provider: GitProvider,
  batch: LoadedBatch,
  author: BatchAuthor | null,
  beforeWrite: () => Promise<void>,
): Promise<Outcome> {
  const { externalId, ownerKind, ownerLogin } = batch.installation;
  const auth = await provider.authenticate({
    installation: { id: externalId, owner: { kind: ownerKind, login: ownerLogin } },
  });
  const repo = { owner: { kind: ownerKind, login: batch.repo.ownerLogin }, name: batch.repo.name };
  const target: Target = { provider, auth, repo, batch, beforeWrite };
  const recovered = await recover(target);
  if (recovered) return recovered;
  try {
    return await attempt(target, author);
  } catch (error) {
    if (!isStaleHead(error)) throw error;
    return attempt(target, author);
  }
}
