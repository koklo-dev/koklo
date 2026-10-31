import {
  type GitAuth,
  type GitProvider,
  GitRateLimitedError,
  parsePullRequestRef,
  RECONCILE_MAX_PULL_REQUESTS_DEFAULT,
} from "@koklo/domain";
import type { Logger } from "@koklo/observability";
import { errorNameOf } from "../job-support.ts";
import type { LinkedRepo, PullRequestStore, PullRequestTicketRow } from "./pr-store.ts";
import { emptyPullRequestCount, type PullRequestCount } from "./types.ts";

export interface PullRequestPassDeps {
  readonly store: PullRequestStore;
  /** `null` : aucun fournisseur configuré, la passe ne fait rien. */
  readonly provider: GitProvider | null;
  readonly maxPullRequests?: number;
  /** Reçoit le nom (jamais le message) des erreurs du fournisseur. */
  readonly logger?: Logger;
}

const PAGE_SIZE = 500;

/**
 * `read` : le ticket a coûté un appel fournisseur (il consomme le plafond) ; `skipped` : non ;
 * `stop` : limite de débit du fournisseur, la passe s'arrête (le ticket sera relu au run suivant).
 */
type Outcome = "read" | "skipped" | "stop";

/** Un run de P3 : bilan, cache d'authentification par installation, un ticket après l'autre. */
class PullRequestRun {
  readonly count: PullRequestCount = emptyPullRequestCount();
  private readonly auths = new Map<string, Promise<GitAuth>>();

  private readonly store: PullRequestStore;
  private readonly provider: GitProvider;
  private readonly logger: Logger | undefined;
  constructor(store: PullRequestStore, provider: GitProvider, logger?: Logger) {
    this.store = store;
    this.provider = provider;
    this.logger = logger;
  }

  async reconcile(ticket: PullRequestTicketRow): Promise<Outcome> {
    const ref = parsePullRequestRef(ticket.pullRequest);
    if (!ref) return this.skip("pr_ref_unparsable", "skipped");
    const repo = await this.store.linkedRepo(ticket, ref.owner, ref.name);
    if (!repo) return this.skip("repo_not_linked", "skipped");
    const status = await this.statusOf(repo, ref.number);
    if (status === "rate_limited") return this.skip("rate_limited", "stop");
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
    } catch (error) {
      this.logger?.warn(
        { errorName: errorNameOf(error) },
        "reconcile: lecture de PR en échec côté fournisseur",
      );
      return error instanceof GitRateLimitedError ? "rate_limited" : undefined;
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

interface Budget {
  reads: number;
  readonly cap: number;
}

interface Progress {
  /** Dernier ticket traité (`null` : aucun). */
  last: string | null;
  /** Plafond atteint, limite de débit, ou borne `until` dépassée : on ne va pas plus loin. */
  stopped: boolean;
}

/** Traite une page ; s'arrête au plafond, à la limite de débit ou au-delà de `until` (inclus). */
async function scanPage(
  run: PullRequestRun,
  page: readonly PullRequestTicketRow[],
  budget: Budget,
  until: string | null,
): Promise<Progress & { pastUntil: boolean }> {
  let last: string | null = null;
  for (const ticket of page) {
    if (until !== null && ticket.id > until) return { last, stopped: false, pastUntil: true };
    const outcome = await run.reconcile(ticket);
    if (outcome === "stop") return { last, stopped: true, pastUntil: false };
    last = ticket.id;
    if (outcome === "read" && ++budget.reads >= budget.cap) {
      return { last, stopped: true, pastUntil: false };
    }
  }
  return { last, stopped: false, pastUntil: false };
}

/**
 * Parcourt les tickets par pages, par identifiant croissant, de `after` (exclu) jusqu'à la fin ou
 * jusqu'à `until` (inclus, relu au plus une fois par tour).
 */
async function scan(
  store: PullRequestStore,
  run: PullRequestRun,
  budget: Budget,
  range: { after: string | null; until: string | null },
): Promise<Progress> {
  let after = range.after;
  let last: string | null = null;
  while (true) {
    const page = await store.ticketPage(after, PAGE_SIZE);
    const result = await scanPage(run, page, budget, range.until);
    last = result.last ?? last;
    const end = page.at(-1);
    if (result.stopped) return { last, stopped: true };
    if (result.pastUntil || !end || page.length < PAGE_SIZE) return { last, stopped: false };
    after = end.id;
  }
}

/**
 * P3 : un ticket `in_review` dont la PR a été fusionnée à la main passe `done` (incident 10).
 * Le dépôt lu est celui lié au PROJET du ticket, jamais celui que nomme la référence seule.
 * Appels fournisseur séquentiels, au plus `maxPullRequests` par run, une authentification par
 * installation. Au-delà du plafond, le run suivant reprend après le dernier ticket traité (puis
 * reboucle au début) : aucun ticket n'est jamais affamé. Une erreur du fournisseur laisse le
 * ticket à son prochain passage ; une limite de débit arrête la passe ; une erreur de base fait
 * échouer la passe (nommée `prs`).
 */
export function pullRequestsPass(deps: PullRequestPassDeps): () => Promise<PullRequestCount> {
  const cap = deps.maxPullRequests ?? RECONCILE_MAX_PULL_REQUESTS_DEFAULT;
  /** Reprise de la rotation : en mémoire du process, sa perte au redémarrage repart du début. */
  let cursor: string | null = null;
  return async () => {
    if (!deps.provider) return emptyPullRequestCount();
    const run = new PullRequestRun(deps.store, deps.provider, deps.logger);
    const budget: Budget = { reads: 0, cap };
    let progress = await scan(deps.store, run, budget, { after: cursor, until: null });
    if (!progress.stopped && cursor !== null) {
      // Fin de liste atteinte : on reboucle au début, jusqu'au point de départ exclu.
      progress = await scan(deps.store, run, budget, { after: null, until: cursor });
    }
    cursor = progress.stopped ? (progress.last ?? cursor) : null;
    return run.count;
  };
}
