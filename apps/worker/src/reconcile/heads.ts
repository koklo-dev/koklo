import {
  GitNotFoundError,
  type GitProvider,
  GitRateLimitedError,
  RECONCILE_MAX_PROVIDER_CALLS_DEFAULT,
} from "@koklo/domain";
import type { Logger } from "@koklo/observability";
import { errorNameOf } from "../job-support.ts";
import { indexBranch, type PushDeps } from "../webhook/push.ts";
import { budgetedProvider, ProviderBudgetExhausted } from "./budget.ts";
import type { HeadRepo, HeadStore } from "./head-store.ts";
import { emptyHeadCount, type HeadCount } from "./types.ts";

export interface HeadsPassDeps {
  readonly store: HeadStore;
  /** Ce que l'indexeur du webhook lit (cibles, écriture d'index) ; son `provider` est ignoré. */
  readonly indexing: Omit<PushDeps, "provider">;
  /** `null` : aucun fournisseur configuré, la passe ne fait rien. */
  readonly provider: GitProvider | null;
  readonly maxProviderCalls?: number;
  readonly logger: Logger;
}

/** Issue d'un dépôt : terminé (avancé), sauté (réessayé plus tard) ou passe arrêtée. */
type RepoOutcome = "done" | "skipped" | "rate_limited" | "budget";

/** Dépôt dont le fournisseur échoue : un 404 « repository » (retiré, transféré, accès perdu). */
const isGoneRepository = (error: unknown): boolean =>
  error instanceof GitNotFoundError && error.resource === "repository";

/** Branches à réconcilier : la branche par défaut et les têtes déjà connues. */
const branchesOf = (repo: HeadRepo): string[] => [
  ...new Set([repo.defaultBranch, ...repo.heads.keys()]),
];

class HeadsRun {
  readonly count: HeadCount = emptyHeadCount();

  constructor(
    private readonly deps: HeadsPassDeps,
    private readonly provider: GitProvider,
  ) {}

  async reconcile(repo: HeadRepo): Promise<RepoOutcome> {
    const { target } = repo;
    try {
      for (const branch of branchesOf(repo)) {
        await indexBranch(
          { ...this.deps.indexing, provider: this.provider },
          this.provider,
          target,
          branch,
        );
      }
    } catch (error) {
      return this.failed(repo, error);
    }
    await this.recordChanges(repo);
    await this.deps.store.markReconciled(target.repo.id);
    return "done";
  }

  /** Un dépôt après l'autre jusqu'à la fin ou à l'arrêt ; `failing` retient les dépôts sautés. */
  async scan(repos: readonly HeadRepo[], failing: Set<string>): Promise<void> {
    for (const repo of repos) {
      const id = repo.target.repo.id;
      if (repo.target.installation.status !== "active") {
        this.count.skipped++;
        continue;
      }
      const outcome = await this.reconcile(repo);
      if (outcome === "skipped") failing.add(id);
      else if (outcome === "done") failing.delete(id);
      else {
        this.count.stopped = outcome;
        return;
      }
    }
  }

  private async failed(repo: HeadRepo, error: unknown): Promise<RepoOutcome> {
    if (error instanceof ProviderBudgetExhausted) return "budget";
    if (error instanceof GitRateLimitedError) return "rate_limited";
    if (isGoneRepository(error)) {
      // Têtes conservées : un dépôt injoignable n'est pas une branche supprimée.
      this.count.unreachable++;
      await this.deps.store.record(repo.target, "unreachable", true);
      await this.deps.store.markReconciled(repo.target.repo.id);
      return "done";
    }
    this.count.skipped++;
    this.deps.logger.warn(
      { errorName: errorNameOf(error) },
      "reconcile: têtes en échec côté fournisseur",
    );
    return "skipped";
  }

  /** Compare les têtes avant/après : seul un changement d'état est compté et journalisé. */
  private async recordChanges(repo: HeadRepo): Promise<void> {
    const after = await this.deps.store.headsOf(repo.target.repo.id);
    const updated = [...after].filter(([branch, snapshot]) => repo.heads.get(branch) !== snapshot);
    const removed = [...repo.heads.keys()].filter((branch) => !after.has(branch));
    this.count.updated += updated.length;
    this.count.removed += removed.length;
    if (updated.length > 0) await this.deps.store.record(repo.target, "head_updated", false);
    if (removed.length > 0) await this.deps.store.record(repo.target, "head_removed", false);
  }
}

/** Dépôts sains d'abord, dépôts sautés au run précédent ensuite (ordre de rotation conservé). */
const healthyFirst = (repos: HeadRepo[], failing: ReadonlySet<string>): HeadRepo[] => [
  ...repos.filter((repo) => !failing.has(repo.target.repo.id)),
  ...repos.filter((repo) => failing.has(repo.target.repo.id)),
];

/**
 * P4 : réconcilie la tête de la branche par défaut et des branches connues de chaque dépôt à spec
 * (index des têtes, push perdu ou branche supprimée) en réutilisant `indexBranch`. Dépôts triés par
 * `last_reconciled_at` (le plus ancien, ou jamais, d'abord), un à la fois ; budget d'appels
 * fournisseur par run (authentification comprise). `last_reconciled_at` n'avance que pour un dépôt
 * terminé (injoignable compris), jamais interrompu. Une limite de débit ou le budget arrêtent la
 * passe sans la faire échouer ; une autre erreur fournisseur saute le dépôt, qui passe alors en fin
 * de file au run suivant (mémoire du process) pour qu'un dépôt cassé ne consomme pas le budget des
 * autres.
 */
export function headsPass(deps: HeadsPassDeps): () => Promise<HeadCount> {
  const cap = deps.maxProviderCalls ?? RECONCILE_MAX_PROVIDER_CALLS_DEFAULT;
  const failing = new Set<string>();
  return async () => {
    if (!deps.provider) return emptyHeadCount();
    const run = new HeadsRun(deps, budgetedProvider(deps.provider, cap));
    await run.scan(healthyFirst(await deps.store.repos(), failing), failing);
    return run.count;
  };
}
