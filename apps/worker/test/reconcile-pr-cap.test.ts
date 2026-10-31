import { type GitProvider, RECONCILE_MAX_PULL_REQUESTS_DEFAULT } from "@koklo/domain";
import { describe, expect, it, vi } from "vitest";
import type { PullRequestStore, PullRequestTicketRow } from "../src/reconcile/pr-store.ts";
import { pullRequestsPass } from "../src/reconcile/pull-requests.ts";

const TICKETS = RECONCILE_MAX_PULL_REQUESTS_DEFAULT + 50;
const rows: PullRequestTicketRow[] = Array.from({ length: TICKETS }, (_, index) => ({
  id: String(index + 1).padStart(8, "0"),
  organizationId: "org",
  projectId: "project",
  pullRequest: `https://github.com/acme/spec/pull/${index + 1}`,
}));

function fakes() {
  const store: PullRequestStore = {
    ticketPage: vi.fn(async (after: string | null, limit: number) =>
      rows.filter((row) => after === null || row.id > after).slice(0, limit),
    ),
    linkedRepo: vi.fn(async () => ({
      owner: "acme",
      name: "spec",
      installation: {
        id: "i",
        externalId: "1",
        ownerKind: "organization" as const,
        ownerLogin: "acme",
      },
    })),
    settleMerged: vi.fn(async () => true),
    recordClosed: vi.fn(async () => {}),
  };
  const provider = {
    authenticate: vi.fn(async () => ({ kind: "installation" })),
    getPullRequestState: vi.fn(async () => ({ status: "open" })),
  } as unknown as GitProvider;
  return { store, provider };
}

describe("reconcile-pr-cap : plafond par run", () => {
  it("ne lit pas plus de RECONCILE_MAX_PULL_REQUESTS_DEFAULT PR chez le fournisseur", async () => {
    const { store, provider } = fakes();
    await pullRequestsPass({ store, provider })();
    expect(provider.getPullRequestState).toHaveBeenCalledTimes(RECONCILE_MAX_PULL_REQUESTS_DEFAULT);
    expect(provider.authenticate).toHaveBeenCalledTimes(1);
  });

  it("un plafond explicite remplace le défaut", async () => {
    const { store, provider } = fakes();
    await pullRequestsPass({ store, provider, maxPullRequests: 3 })();
    expect(provider.getPullRequestState).toHaveBeenCalledTimes(3);
  });

  it("les références illisibles ne consomment pas le plafond", async () => {
    const { store, provider } = fakes();
    const junk = rows.slice(0, 5).map((row) => ({ ...row, pullRequest: "n'importe quoi" }));
    const valid = rows.slice(5, 8);
    store.ticketPage = vi.fn(async (after: string | null) =>
      after === null ? [...junk, ...valid] : [],
    );
    const count = await pullRequestsPass({ store, provider, maxPullRequests: 3 })();
    expect(provider.getPullRequestState).toHaveBeenCalledTimes(3);
    expect(count.reasons.pr_ref_unparsable).toBe(5);
  });

  it("sans fournisseur, la passe ne lit rien", async () => {
    const { store } = fakes();
    const count = await pullRequestsPass({ store, provider: null })();
    expect(store.ticketPage).not.toHaveBeenCalled();
    expect(count).toEqual({ done: 0, closed: 0, skipped: 0, reasons: {} });
  });
});
