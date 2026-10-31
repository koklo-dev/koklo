import {
  type GitAuth,
  type GitProvider,
  parsePullRequestRef,
  RECONCILE_MAX_PULL_REQUESTS_DEFAULT,
} from "@koklo/domain";
import type { LinkedRepo, PullRequestStore, PullRequestTicketRow } from "./pr-store.ts";
import { emptyPullRequestCount, type PullRequestCount } from "./types.ts";

export interface PullRequestPassDeps {
  readonly store: PullRequestStore;
  /** `null` : aucun fournisseur configuré, la passe ne fait rien. */
  readonly provider: GitProvider | null;
  readonly maxPullRequests?: number;
}

const PAGE_SIZE = 500;

/** Un ticket est « lu » quand il a coûté un appel fournisseur (il consomme alors le plafond). */
type Outcome = "read" | "skipped";

/** Un run de P3 : bilan, cache d'authentification par installation, un ticket après l'autre. */
class PullRequestRun {
  readonly count: PullRequestCount = emptyPullRequestCount();
  private readonly auths = new Map<string, Promise<GitAuth>>();

  constructor(
    private readonly store: PullRequestStore,
    private readonly provider: GitProvider,
  ) {}

  async reconcile(ticket: PullRequestTicketRow): Promise<Outcome> {
    const ref = parsePullRequestRef(ticket.pullRequest);
    if (!ref) return this.skip("pr_ref_unparsable", "skipped");
    const repo = await this.store.linkedRepo(ticket, ref.owner, ref.name);
    if (!repo) return this.skip("repo_not_linked", "skipped");
    const status = await this.statusOf(repo, ref.number);
    if (status === undefined) return this.skip("provider_error", "read");
    if (status === "merged") {
      if (await this.store.settleMerged(ticket)) this.count.done++;
    } else if (status === "closed") {
      await this.store.recordClosed(ticket);
      this.count.closed++;
    }
    return "read";
  }

  /** `undefined` quand le fournisseur échoue : le ticket attend le tick suivant. */
  private async statusOf(repo: LinkedRepo, number: number) {
    try {
      const state = await this.provider.getPullRequestState({
        auth: await this.authOf(repo),
        pullRequest: {
          repo: {
            owner: { kind: repo.installation.ownerKind, login: repo.owner },
            name: repo.name,
          },
          number,
        },
      });
      return state.status;
    } catch {
      return undefined;
    }
  }

  private authOf({ installation }: LinkedRepo): Promise<GitAuth> {
    let auth = this.auths.get(installation.id);
    if (!auth) {
      auth = this.provider.authenticate({
        installation: {
          id: installation.externalId,
          owner: { kind: installation.ownerKind, login: installation.ownerLogin },
        },
      });
      this.auths.set(installation.id, auth);
    }
    return auth;
  }

  private skip(reason: string, outcome: Outcome): Outcome {
    this.count.skipped++;
    this.count.reasons[reason] = (this.count.reasons[reason] ?? 0) + 1;
    return outcome;
  }
}

/** Parcourt les tickets par pages jusqu'à `cap` lectures fournisseur ou la fin de la liste. */
async function reconcileUpTo(store: PullRequestStore, run: PullRequestRun, cap: number) {
  let reads = 0;
  let after: string | null = null;
  while (reads < cap) {
    const page = await store.ticketPage(after, PAGE_SIZE);
    for (const ticket of page) {
      if (reads >= cap) break;
      if ((await run.reconcile(ticket)) === "read") reads++;
    }
    const last = page.at(-1);
    if (!last || page.length < PAGE_SIZE) return;
    after = last.id;
  }
}

/**
 * P3 : un ticket `in_review` dont la PR a été fusionnée à la main passe `done` (incident 10).
 * Le dépôt lu est celui lié au PROJET du ticket, jamais celui que nomme la référence seule.
 * Appels fournisseur séquentiels, au plus `maxPullRequests` par run, une authentification par
 * installation. Une erreur du fournisseur laisse le ticket au tick suivant ; une erreur de base
 * fait échouer la passe (nommée `prs`).
 */
export function pullRequestsPass(deps: PullRequestPassDeps): () => Promise<PullRequestCount> {
  const cap = deps.maxPullRequests ?? RECONCILE_MAX_PULL_REQUESTS_DEFAULT;
  return async () => {
    if (!deps.provider) return emptyPullRequestCount();
    const run = new PullRequestRun(deps.store, deps.provider);
    await reconcileUpTo(deps.store, run, cap);
    return run.count;
  };
}
