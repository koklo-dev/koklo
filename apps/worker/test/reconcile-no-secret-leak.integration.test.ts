import { GitNotFoundError, GitRateLimitedError } from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { orphanDelivery, resetBench, runReconcile } from "./support/reconcile-bench.ts";
import {
  clearRepos,
  failBranch,
  failFor,
  hoursAgo,
  setReconciledAt,
} from "./support/reconcile-heads-bench.ts";
import { insertTicket, openPullRequest, prUrl } from "./support/reconcile-pr-bench.ts";
import { WebhookBench, type WebhookScene } from "./support/webhook-bench.ts";

/**
 * TK-46c AC-14 `reconcile-no-secret-leak` : une erreur du fournisseur dont le message, la cause ou
 * l'identifiant contient un faux jeton, ou une charge de livraison qui en contient un, n'apparaît
 * NULLE PART après un run complet (P1 à P4) : ni journaux, ni audit, ni sortie du job pg-boss, ni
 * lignes de livraison. Seuls des noms de classes, des nombres et des codes fermés sont admis.
 */
const CANARY = "ghs_CANARY0123456789abcdefSECRET";
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
  await clearRepos(bench);
});

const tainted = (label: string) =>
  Object.assign(new Error(`${label} Authorization: token ${CANARY}`), {
    cause: new Error(CANARY),
    token: CANARY,
  });

/** Tout ce que le run a pu écrire, en une chaîne. */
async function everythingWritten(scenes: WebhookScene[]): Promise<string> {
  const audit = await bench.query<{ row: string }>(
    "SELECT to_jsonb(a)::text AS row FROM audit_log a WHERE organization_id = ANY($1::uuid[])",
    [scenes.map((scene) => scene.organizationId)],
  );
  const jobs = await bench.query<{ row: string }>(
    "SELECT to_jsonb(j)::text AS row FROM pgboss.job j WHERE name = ANY($1::text[])",
    [["reconcile", "webhook-delivery", "spec-write"]],
  );
  const repos = await bench.query<{ row: string }>(
    "SELECT to_jsonb(r)::text AS row FROM project_repos r",
  );
  const heads = await bench.query<{ row: string }>(
    "SELECT to_jsonb(h)::text AS row FROM spec_heads h",
  );
  return [
    ...bench.lines,
    ...[...audit, ...jobs, ...repos, ...heads].map((entry) => entry.row),
  ].join("\n");
}

describe("reconcile-no-secret-leak", () => {
  it("P4 : erreurs fournisseur à l'authentification et à la lecture, 404 à l'identifiant piégé, limite de débit", async () => {
    const [auth, read, missing, limited] = [
      await bench.scene(),
      await bench.scene(),
      await bench.scene(),
      await bench.scene(),
    ] as [WebhookScene, WebhookScene, WebhookScene, WebhookScene];
    await bench.push(read, { after: await bench.commit(read, {}) });
    await bench.push(missing, { after: await bench.commit(missing, {}) });
    for (const [index, scene] of [auth, read, missing, limited].entries()) {
      await setReconciledAt(bench, scene, hoursAgo(10 - index));
    }
    bench.spy.reset();
    failFor(bench, auth, { authenticate: () => tainted("authenticate") });
    failFor(bench, read, { listFiles: () => tainted("listFiles") });
    failFor(bench, missing, {
      listFiles: () =>
        new GitNotFoundError({ operation: "listFiles", resource: "ref", identifier: CANARY }),
      getRepo: () =>
        new GitNotFoundError({ operation: "getRepo", resource: "repository", identifier: CANARY }),
    });
    failFor(bench, limited, {
      listFiles: () =>
        Object.assign(new GitRateLimitedError({ operation: "listFiles", retryAfterMs: 1 }), {
          detail: CANARY,
        }),
    });

    const summary = await runReconcile(bench);

    expect(summary.heads?.skipped).toBeGreaterThanOrEqual(1);
    expect(await everythingWritten([auth, read, missing, limited])).not.toContain(CANARY);
  });

  it("P4 : branche disparue puis vérification du dépôt en échec piégé", async () => {
    const scene = await bench.scene();
    await bench.push(scene, { after: await bench.commit(scene, {}) });
    bench.spy.reset();
    failBranch(bench, scene, "cadrage");
    failFor(bench, scene, { getRepo: () => tainted("getRepo") });
    bench.spy.hooks.set("listFiles", async (request) => {
      if ((request.repo as { name: string }).name === scene.ref.name && request.ref === "cadrage") {
        throw new GitNotFoundError({ operation: "listFiles", resource: "ref", identifier: CANARY });
      }
    });

    await runReconcile(bench);

    expect(await everythingWritten([scene])).not.toContain(CANARY);
  });
});

describe("reconcile-no-secret-leak : P3 et P1", () => {
  it("P3 : lecture de PR en échec avec un message piégé", async () => {
    const scene = await bench.scene();
    const pr = await openPullRequest(bench, scene);
    await insertTicket(bench, scene, { pullRequest: prUrl(scene, pr.number) });
    failFor(bench, scene, { getPullRequestState: () => tainted("getPullRequestState") });

    await runReconcile(bench);

    expect(await everythingWritten([scene])).not.toContain(CANARY);
  });

  it("P1 : charge de livraison orpheline contenant le jeton", async () => {
    const scene = await bench.scene();
    await orphanDelivery(bench, scene, { canary: CANARY });

    await runReconcile(bench);

    const logged = bench.lines.join("\n");
    expect(logged).not.toContain(CANARY);
    const jobs = await bench.query<{ row: string }>(
      "SELECT to_jsonb(j)::text AS row FROM pgboss.job j WHERE name = ANY($1::text[])",
      [["reconcile"]],
    );
    expect(jobs.map((job) => job.row).join("\n")).not.toContain(CANARY);
  });
});
