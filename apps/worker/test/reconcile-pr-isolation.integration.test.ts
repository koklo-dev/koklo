import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetBench, runReconcile } from "./support/reconcile-bench.ts";
import {
  auditOf,
  insertTicket,
  mergeByHand,
  openPullRequest,
  prUrl,
  statusOf,
} from "./support/reconcile-pr-bench.ts";
import { WebhookBench, type WebhookScene } from "./support/webhook-bench.ts";

/**
 * TK-46b : garde multi-tenant (AC-4) et formats de référence hostiles (AC-5), plus le budget
 * d'appels fournisseur. Le dépôt de la PR doit être lié au PROJET du ticket (installation active) :
 * une URL forgée ne fait jamais lire (ni fusionner côté base) un autre dépôt.
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

const readsOf = (repoName: string) =>
  bench.spy.callsOf("getPullRequestState").filter((call) => {
    const pullRequest = call.request.pullRequest as { repo: { name: string } };
    return pullRequest.repo.name === repoName;
  });

describe("reconcile-pr-multitenant-isolation", () => {
  it("deux organisations, même numéro de PR : seule celle dont la PR est fusionnée change", async () => {
    const a = await bench.scene();
    const b = await bench.scene();
    const prA = await openPullRequest(bench, a);
    const prB = await openPullRequest(bench, b);
    expect(prA.number).toBe(prB.number);
    const ticketA = await insertTicket(bench, a, { pullRequest: prUrl(a, prA.number) });
    const ticketB = await insertTicket(bench, b, { pullRequest: prUrl(b, prB.number) });
    await mergeByHand(bench, a, prA);

    await runReconcile(bench);

    expect(await statusOf(bench, ticketA.id)).toBe("done");
    expect(await statusOf(bench, ticketB.id)).toBe("in_review");
    expect(await auditOf(bench, a.organizationId)).toHaveLength(1);
    expect(await auditOf(bench, b.organizationId)).toEqual([]);
  });

  it("URL pointant le dépôt d'une AUTRE organisation (fusionné) : sautée, aucun appel fournisseur", async () => {
    const victim = await bench.scene();
    const attacker = await bench.scene();
    const pr = await openPullRequest(bench, victim);
    await mergeByHand(bench, victim, pr);
    const forged = await insertTicket(bench, attacker, { pullRequest: prUrl(victim, pr.number) });

    const summary = await runReconcile(bench);

    expect(await statusOf(bench, forged.id)).toBe("in_review");
    expect(summary.prs?.skipped).toBeGreaterThanOrEqual(1);
    expect(summary.prs?.reasons?.repo_not_linked).toBeGreaterThanOrEqual(1);
    expect(readsOf(victim.ref.name)).toEqual([]);
    expect(await auditOf(bench, attacker.organizationId)).toEqual([]);
    expect(await auditOf(bench, victim.organizationId)).toEqual([]);
  });
});

describe("reconcile-pr-multitenant-isolation : liaison du dépôt", () => {
  it("dépôt lié à un AUTRE projet de la même organisation : sauté, aucun appel fournisseur", async () => {
    const scene = await bench.scene();
    const pr = await openPullRequest(bench, scene);
    await mergeByHand(bench, scene, pr);
    const otherProject = randomUUID();
    await bench.query(
      "INSERT INTO projects (id, organization_id, name, created_at, updated_at) VALUES ($1, $2, 'Autre', now(), now())",
      [otherProject, scene.organizationId],
    );
    const forged = await insertTicket(bench, scene, {
      projectId: otherProject,
      pullRequest: prUrl(scene, pr.number),
    });

    const summary = await runReconcile(bench);

    expect(await statusOf(bench, forged.id)).toBe("in_review");
    expect(summary.prs?.reasons?.repo_not_linked).toBeGreaterThanOrEqual(1);
    expect(readsOf(scene.ref.name)).toEqual([]);
  });

  it("dépôt jamais lié (inconnu de la base) : sauté, aucun appel fournisseur", async () => {
    const scene = await bench.scene();
    const ticket = await insertTicket(bench, scene, {
      pullRequest: "https://github.com/inconnu-org/inconnu-depot/pull/1",
    });

    const summary = await runReconcile(bench);

    expect(await statusOf(bench, ticket.id)).toBe("in_review");
    expect(summary.prs?.reasons?.repo_not_linked).toBeGreaterThanOrEqual(1);
    expect(readsOf("inconnu-depot")).toEqual([]);
  });

  it.each(["suspended", "deleted"])(
    "installation %s : ticket intact, aucun appel fournisseur",
    async (status) => {
      const scene = await bench.scene();
      const pr = await openPullRequest(bench, scene);
      const ticket = await insertTicket(bench, scene, { pullRequest: prUrl(scene, pr.number) });
      await mergeByHand(bench, scene, pr);
      await bench.query(
        "UPDATE provider_installations SET status = $2::installation_status WHERE id = $1",
        [scene.installationId, status],
      );

      const summary = await runReconcile(bench);

      expect(await statusOf(bench, ticket.id)).toBe("in_review");
      expect(summary.prs?.reasons?.repo_not_linked).toBeGreaterThanOrEqual(1);
      expect(readsOf(scene.ref.name)).toEqual([]);
    },
  );
});

describe("reconcile-pr-ref-unparsable-skipped", () => {
  async function hostile(scene: WebhookScene) {
    const pr = await openPullRequest(bench, scene);
    await mergeByHand(bench, scene, pr);
    const good = `${scene.owner.login}/${scene.ref.name}`;
    const references = [
      `https://evil.example/${good}/pull/${pr.number}`,
      `http://github.com/${good}/pull/${pr.number}`,
      `https://github.com/../${scene.ref.name}/pull/${pr.number}`,
      `https://github.com/${scene.owner.login}/../pull/${pr.number}`,
      `https://github.com/${good}/pull/-1`,
      `https://github.com/${good}/pull/0`,
      `https://github.com/${good}/pull/${"9".repeat(30)}`,
      `https://github.com/${good}/pull/${pr.number}/files`,
      `https://github.com/${good}/issues/${pr.number}`,
      `${good}#${pr.number}`,
      `#${pr.number}`,
      "PR fusionnée, voir Slack",
      "x".repeat(10_000),
    ];
    const tickets = [];
    for (const pullRequest of references) {
      tickets.push(await insertTicket(bench, scene, { pullRequest }));
    }
    return tickets;
  }

  it("formats invalides ou hostiles : tickets intacts, run vert, aucun appel fournisseur", async () => {
    const scene = await bench.scene();
    const tickets = await hostile(scene);

    const summary = await runReconcile(bench);

    expect(summary.failedPasses).toEqual([]);
    for (const ticket of tickets) expect(await statusOf(bench, ticket.id)).toBe("in_review");
    expect(summary.prs?.done).toBe(0);
    expect(summary.prs?.reasons?.pr_ref_unparsable).toBeGreaterThanOrEqual(tickets.length);
    expect(readsOf(scene.ref.name)).toEqual([]);
    expect(await auditOf(bench, scene.organizationId)).toEqual([]);
  });

  it("une référence invalide n'empêche pas de réconcilier un ticket valide du même run", async () => {
    const scene = await bench.scene();
    await insertTicket(bench, scene, { pullRequest: "https://github.com/../x/pull/1" });
    const pr = await openPullRequest(bench, scene);
    const valid = await insertTicket(bench, scene, { pullRequest: prUrl(scene, pr.number) });
    await mergeByHand(bench, scene, pr);

    await runReconcile(bench);

    expect(await statusOf(bench, valid.id)).toBe("done");
  });
});

describe("reconcile-pr-provider-budget", () => {
  it("authenticate une seule fois par installation et par run, getPullRequestState une fois par ticket", async () => {
    const scene = await bench.scene();
    const one = await openPullRequest(bench, scene);
    const two = await openPullRequest(bench, scene);
    await insertTicket(bench, scene, { pullRequest: prUrl(scene, one.number) });
    await insertTicket(bench, scene, { pullRequest: prUrl(scene, two.number) });
    bench.spy.calls = [];

    await runReconcile(bench);

    const auths = bench.spy
      .callsOf("authenticate")
      .filter((call) => JSON.stringify(call.request).includes(scene.owner.login));
    expect(auths).toHaveLength(1);
    expect(readsOf(scene.ref.name)).toHaveLength(2);
  });

  it("aucune authentification quand aucun ticket ne peut être réconcilié", async () => {
    const scene = await bench.scene();
    await insertTicket(bench, scene, { status: "todo" });
    await insertTicket(bench, scene, { pullRequest: "n'importe quoi" });
    bench.spy.calls = [];

    const summary = await runReconcile(bench);

    expect(summary.prs).toMatchObject({ done: 0, closed: 0 });
    const auths = bench.spy
      .callsOf("authenticate")
      .filter((call) => JSON.stringify(call.request).includes(scene.owner.login));
    expect(auths).toEqual([]);
  });
});
