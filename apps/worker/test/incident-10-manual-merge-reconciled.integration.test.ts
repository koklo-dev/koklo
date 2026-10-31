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
  statusOf,
} from "./support/reconcile-pr-bench.ts";
import { WebhookBench } from "./support/webhook-bench.ts";

/**
 * TK-46b, incident 10 (annexe C.5) : « vault figé sur un état périmé après un merge manuel ».
 * Une PR fusionnée à la main chez le fournisseur doit faire passer son ticket `in_review` à `done`,
 * libérer le bail du runner et laisser une trace d'audit système ; un second tick ne change rien.
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

describe("incident-10-manual-merge-reconciled", () => {
  it("ticket in_review + PR fusionnée à la main : done, bail libéré, un audit système ; le 2e run ne change rien", async () => {
    const scene = await bench.scene();
    const pr = await openPullRequest(bench, scene);
    const ticket = await insertTicket(bench, scene, { pullRequest: prUrl(scene, pr.number) });
    const lease = await openLease(bench, scene, ticket.id);
    await mergeByHand(bench, scene, pr);

    const first = await runReconcile(bench);

    expect(await statusOf(bench, ticket.id)).toBe("done");
    expect(await leaseReleased(bench, lease)).toBe(true);
    expect(first.prs?.done).toBe(1);
    expect(await auditOf(bench, scene.organizationId)).toEqual([
      {
        actor_kind: "system",
        actor_id: null,
        action: "ticket.reconcile.pr_merged",
        target_kind: "ticket",
        target_id: ticket.id,
        ticket_id: ticket.id,
        organization_id: scene.organizationId,
      },
    ]);

    const second = await runReconcile(bench);

    expect(second.prs?.done).toBe(0);
    expect(await statusOf(bench, ticket.id)).toBe("done");
    expect(await auditOf(bench, scene.organizationId)).toHaveLength(1);
  });
});

describe("incident-10-manual-merge-reconciled : tickets non concernés", () => {
  it("PR encore ouverte : le ticket reste in_review, son bail est conservé, aucun audit", async () => {
    const scene = await bench.scene();
    const pr = await openPullRequest(bench, scene);
    const ticket = await insertTicket(bench, scene, { pullRequest: prUrl(scene, pr.number) });
    const lease = await openLease(bench, scene, ticket.id);

    const summary = await runReconcile(bench);

    expect(summary.prs?.done).toBe(0);
    expect(await statusOf(bench, ticket.id)).toBe("in_review");
    expect(await leaseReleased(bench, lease)).toBe(false);
    expect(await auditOf(bench, scene.organizationId)).toEqual([]);
  });

  it("seul le ticket de la PR fusionnée change : les autres tickets du projet sont intacts", async () => {
    const scene = await bench.scene();
    const merged = await openPullRequest(bench, scene);
    const pending = await openPullRequest(bench, scene);
    const a = await insertTicket(bench, scene, { pullRequest: prUrl(scene, merged.number) });
    const b = await insertTicket(bench, scene, { pullRequest: prUrl(scene, pending.number) });
    const c = await insertTicket(bench, scene, { status: "todo" });
    const leaseA = await openLease(bench, scene, a.id);
    const leaseB = await openLease(bench, scene, b.id);
    await mergeByHand(bench, scene, merged);

    await runReconcile(bench);

    expect(await statusOf(bench, a.id)).toBe("done");
    expect(await statusOf(bench, b.id)).toBe("in_review");
    expect(await statusOf(bench, c.id)).toBe("todo");
    expect(await leaseReleased(bench, leaseA)).toBe(true);
    expect(await leaseReleased(bench, leaseB)).toBe(false);
    expect((await auditOf(bench, scene.organizationId)).map((row) => row.ticket_id)).toEqual([
      a.id,
    ]);
  });
});

describe("incident-10-manual-merge-reconciled : cas limites", () => {
  it("ticket sans bail ouvert : passe quand même à done avec son audit", async () => {
    const scene = await bench.scene();
    const pr = await openPullRequest(bench, scene);
    const ticket = await insertTicket(bench, scene, { pullRequest: prUrl(scene, pr.number) });
    await mergeByHand(bench, scene, pr);

    await runReconcile(bench);

    expect(await statusOf(bench, ticket.id)).toBe("done");
    expect(await auditOf(bench, scene.organizationId)).toHaveLength(1);
  });
});

describe("incident-10-manual-merge-reconciled : bail et périmètre", () => {
  it("un bail déjà libéré garde sa date de libération d'origine", async () => {
    const scene = await bench.scene();
    const pr = await openPullRequest(bench, scene);
    const ticket = await insertTicket(bench, scene, { pullRequest: prUrl(scene, pr.number) });
    const lease = await openLease(bench, scene, ticket.id);
    const earlier = new Date(Date.now() - 3_600_000);
    await bench.query("UPDATE leases SET released_at = $2 WHERE id = $1", [lease, earlier]);
    await mergeByHand(bench, scene, pr);

    await runReconcile(bench);

    const [row] = await bench.query<{ released_at: Date }>(
      "SELECT released_at FROM leases WHERE id = $1",
      [lease],
    );
    expect(await statusOf(bench, ticket.id)).toBe("done");
    expect(row?.released_at.getTime()).toBe(earlier.getTime());
  });

  it("supprimé, sans PR, en cours ou bloqué : intacts malgré une PR fusionnée (un ticket témoin in_review passe à done)", async () => {
    const scene = await bench.scene();
    const pr = await openPullRequest(bench, scene);
    const url = prUrl(scene, pr.number);
    const deleted = await insertTicket(bench, scene, { pullRequest: url, deletedAt: new Date() });
    const noPr = await insertTicket(bench, scene);
    const inProgress = await insertTicket(bench, scene, {
      pullRequest: url,
      status: "in_progress",
    });
    const blocked = await insertTicket(bench, scene, { pullRequest: url, status: "blocked" });
    const control = await insertTicket(bench, scene, { pullRequest: url });
    await mergeByHand(bench, scene, pr);

    await runReconcile(bench);

    expect(await statusOf(bench, control.id)).toBe("done");
    expect(await statusOf(bench, deleted.id)).toBe("in_review");
    expect(await statusOf(bench, noPr.id)).toBe("in_review");
    expect(await statusOf(bench, inProgress.id)).toBe("in_progress");
    expect(await statusOf(bench, blocked.id)).toBe("blocked");
    expect((await auditOf(bench, scene.organizationId)).map((row) => row.ticket_id)).toEqual([
      control.id,
    ]);
  });
});
