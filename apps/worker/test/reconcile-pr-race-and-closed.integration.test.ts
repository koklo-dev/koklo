import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetBench, runReconcile } from "./support/reconcile-bench.ts";
import {
  auditOf,
  insertTicket,
  leaseReleased,
  mergeByHand,
  openLease,
  openPullRequest,
  prUrl,
  reportClosed,
  statusOf,
} from "./support/reconcile-pr-bench.ts";
import { WebhookBench } from "./support/webhook-bench.ts";

/**
 * TK-46b : mise à jour conditionnelle `WHERE status = 'in_review'` (course avec le runner/l'API,
 * AC-2) et PR fermée sans fusion (AC-3 : aucune transition, un seul audit `pr_closed`).
 */
let bench: WebhookBench;

beforeAll(async () => {
  bench = await WebhookBench.create();
  await bench.start();
}, 240_000);
afterAll(async () => {
  await bench?.dispose();
});
beforeEach(async () => {
  await resetBench(bench);
});

describe("reconcile-manual-merge-race-with-runner", () => {
  it("ticket passé à done entre la lecture et l'écriture : aucun audit, aucune erreur, bail non touché", async () => {
    const scene = await bench.scene();
    const pr = await openPullRequest(bench, scene);
    const ticket = await insertTicket(bench, scene, { pullRequest: prUrl(scene, pr.number) });
    const lease = await openLease(bench, scene, ticket.id);
    await mergeByHand(bench, scene, pr);
    bench.spy.hooks.set("getPullRequestState", async () => {
      await bench.query("UPDATE tickets SET status = 'done', updated_at = now() WHERE id = $1", [
        ticket.id,
      ]);
    });

    const summary = await runReconcile(bench);

    expect(summary.failedPasses).toEqual([]);
    expect(summary.prs?.done).toBe(0);
    expect(await statusOf(bench, ticket.id)).toBe("done");
    expect(await auditOf(bench, scene.organizationId)).toEqual([]);
    expect(await leaseReleased(bench, lease)).toBe(false);
  });

  it("ticket annulé entre la lecture et l'écriture : il reste cancelled", async () => {
    const scene = await bench.scene();
    const pr = await openPullRequest(bench, scene);
    const ticket = await insertTicket(bench, scene, { pullRequest: prUrl(scene, pr.number) });
    await mergeByHand(bench, scene, pr);
    bench.spy.hooks.set("getPullRequestState", async () => {
      await bench.query("UPDATE tickets SET status = 'cancelled' WHERE id = $1", [ticket.id]);
    });

    await runReconcile(bench);

    expect(await statusOf(bench, ticket.id)).toBe("cancelled");
    expect(await auditOf(bench, scene.organizationId)).toEqual([]);
  });
});

describe("reconcile-pr-closed-unmerged-no-transition", () => {
  it("PR fermée sans fusion : statut et bail inchangés, un seul audit pr_closed sur deux runs", async () => {
    const scene = await bench.scene();
    const pr = await openPullRequest(bench, scene);
    const ticket = await insertTicket(bench, scene, { pullRequest: prUrl(scene, pr.number) });
    const lease = await openLease(bench, scene, ticket.id);
    const restore = reportClosed(bench, scene.ref.name, [pr.number]);
    try {
      const first = await runReconcile(bench);
      const second = await runReconcile(bench);

      expect(first.prs).toMatchObject({ done: 0, closed: 1 });
      expect(second.prs?.done).toBe(0);
    } finally {
      restore();
    }

    expect(await statusOf(bench, ticket.id)).toBe("in_review");
    expect(await leaseReleased(bench, lease)).toBe(false);
    expect(await auditOf(bench, scene.organizationId)).toEqual([
      expect.objectContaining({
        actor_kind: "system",
        action: "ticket.reconcile.pr_closed",
        target_kind: "ticket",
        target_id: ticket.id,
        ticket_id: ticket.id,
      }),
    ]);
  });
});

describe("reconcile-pr-closed-unmerged-no-transition : plusieurs PR", () => {
  it("deux tickets aux PR fermées : un audit pr_closed chacun", async () => {
    const scene = await bench.scene();
    const one = await openPullRequest(bench, scene);
    const two = await openPullRequest(bench, scene);
    const a = await insertTicket(bench, scene, { pullRequest: prUrl(scene, one.number) });
    const b = await insertTicket(bench, scene, { pullRequest: prUrl(scene, two.number) });
    const restore = reportClosed(bench, scene.ref.name, [one.number, two.number]);
    try {
      await runReconcile(bench);
      await runReconcile(bench);
    } finally {
      restore();
    }

    const audit = await auditOf(bench, scene.organizationId, "ticket.reconcile.pr_closed");
    expect(audit.map((row) => row.ticket_id).sort()).toEqual([a.id, b.id].sort());
  });

  it("PR fermée puis fusionnée ensuite : le run suivant passe le ticket à done", async () => {
    const scene = await bench.scene();
    const pr = await openPullRequest(bench, scene);
    const ticket = await insertTicket(bench, scene, { pullRequest: prUrl(scene, pr.number) });
    const restore = reportClosed(bench, scene.ref.name, [pr.number]);
    try {
      await runReconcile(bench);
    } finally {
      restore();
    }
    expect(await statusOf(bench, ticket.id)).toBe("in_review");
    await mergeByHand(bench, scene, pr);

    await runReconcile(bench);

    expect(await statusOf(bench, ticket.id)).toBe("done");
    expect(await auditOf(bench, scene.organizationId, "ticket.reconcile.pr_merged")).toHaveLength(
      1,
    );
  });
});
