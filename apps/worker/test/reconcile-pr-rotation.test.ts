import {
  type GitProvider,
  GitRateLimitedError,
  RECONCILE_MAX_PULL_REQUESTS_DEFAULT,
} from "@koklo/domain";
import { describe, expect, it, vi } from "vitest";
import type { PullRequestStore, PullRequestTicketRow } from "../src/reconcile/pr-store.ts";
import { pullRequestsPass } from "../src/reconcile/pull-requests.ts";

const CAP = RECONCILE_MAX_PULL_REQUESTS_DEFAULT;
const TICKETS = CAP + 50;
const MERGED_NUMBER = CAP + 30;

const rows: PullRequestTicketRow[] = Array.from({ length: TICKETS }, (_, index) => ({
  id: String(index + 1).padStart(8, "0"),
  organizationId: "org",
  projectId: "project",
  pullRequest: `https://github.com/acme/spec/pull/${index + 1}`,
}));

type Status = "open" | "closed" | "merged";

function fakes(statusOf: (number: number) => Status | Error = () => "open") {
  const settled: string[] = [];
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
    settleMerged: vi.fn(async (ticket: PullRequestTicketRow) => {
      settled.push(ticket.id);
      return true;
    }),
    recordClosed: vi.fn(async () => {}),
  };
  const read: number[] = [];
  const provider = {
    authenticate: vi.fn(async () => ({ kind: "installation" })),
    getPullRequestState: vi.fn(async (input: { pullRequest: { number: number } }) => {
      const { number } = input.pullRequest;
      read.push(number);
      const status = statusOf(number);
      if (status instanceof Error) throw status;
      return { status };
    }),
  } as unknown as GitProvider;
  return { store, provider, settled, read };
}

describe("reconcile-pr-rotation : aucune famine au-delà du plafond", () => {
  it("plus de 200 tickets in_review : le ticket de PR fusionnée au-delà du plafond est réconcilié au run suivant", async () => {
    const { store, provider, settled } = fakes((n) => (n === MERGED_NUMBER ? "merged" : "open"));
    const pass = pullRequestsPass({ store, provider });

    const first = await pass();
    expect(first.done).toBe(0);
    const second = await pass();

    expect(second.done).toBe(1);
    expect(settled).toEqual([String(MERGED_NUMBER).padStart(8, "0")]);
  });

  it("le run suivant reprend après le dernier ticket lu, puis reboucle au début sans dépasser le plafond", async () => {
    const { store, provider, read } = fakes();
    const pass = pullRequestsPass({ store, provider });

    await pass();
    read.length = 0;
    await pass();

    expect(read).toHaveLength(CAP);
    expect(read.slice(0, 3)).toEqual([CAP + 1, CAP + 2, CAP + 3]);
    expect(read.at(-1)).toBe(150);
  });

  it("un tour complet recommence au premier ticket", async () => {
    const { store, provider, read } = fakes();
    const pass = pullRequestsPass({ store, provider, maxPullRequests: TICKETS });

    await pass();
    read.length = 0;
    await pass();

    expect(read).toHaveLength(TICKETS);
    expect(read[0]).toBe(1);
  });
});

describe("reconcile-pr-provider-errors", () => {
  it("un ticket en erreur fournisseur n'empêche pas les suivants et est compté provider_error", async () => {
    const { store, provider, settled } = fakes((n) =>
      n === 1 ? new Error("secret-message") : n === 2 ? "merged" : "open",
    );
    const warn = vi.fn();
    const count = await pullRequestsPass({
      store,
      provider,
      maxPullRequests: 5,
      logger: { warn } as never,
    })();

    expect(count.reasons.provider_error).toBe(1);
    expect(count.done).toBe(1);
    expect(settled).toEqual(["00000002"]);
    expect(JSON.stringify(warn.mock.calls)).toContain("Error");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-message");
  });

  it("une limite de débit arrête la passe proprement, journalise le nom de l'erreur et reprend au ticket en cause", async () => {
    const limited = new GitRateLimitedError({ operation: "getPullRequestState", retryAfterMs: 5 });
    let blocked = true;
    const { store, provider, read } = fakes((n) => (n === 4 && blocked ? limited : "open"));
    const warn = vi.fn();
    const pass = pullRequestsPass({
      store,
      provider,
      maxPullRequests: 50,
      logger: { warn } as never,
    });

    const first = await pass();

    expect(read).toEqual([1, 2, 3, 4]);
    expect(first.reasons.rate_limited).toBe(1);
    expect(JSON.stringify(warn.mock.calls)).toContain("GitRateLimitedError");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("réessayez");

    blocked = false;
    read.length = 0;
    await pass();
    expect(read[0]).toBe(4);
  });
});
