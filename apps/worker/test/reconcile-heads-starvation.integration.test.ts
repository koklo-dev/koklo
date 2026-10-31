import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetBench, runReconcile } from "./support/reconcile-bench.ts";
import {
  clearRepos,
  failFor,
  hoursAgo,
  reconciledAt,
  setReconciledAt,
  touches,
} from "./support/reconcile-heads-bench.ts";
import { WebhookBench } from "./support/webhook-bench.ts";

/**
 * TK-46c : un dépôt dont le fournisseur échoue en permanence reste le plus ancien (il n'avance
 * pas) ; il ne doit pourtant pas passer avant les dépôts sains au run suivant, sinon il pourrait
 * consommer seul le budget d'appels.
 */
let bench: WebhookBench;

beforeAll(async () => {
  bench = await WebhookBench.create();
  await bench.start({ reconcileMaxProviderCalls: 10 });
}, 240_000);
afterAll(async () => {
  await bench?.dispose();
});
beforeEach(async () => {
  await resetBench(bench);
  await clearRepos(bench);
});

describe("dépôt en échec permanent", () => {
  it("passe après les dépôts sains au run suivant, sans avancer lui-même", async () => {
    const broken = await bench.scene();
    const healthy = await bench.scene();
    await setReconciledAt(bench, broken, hoursAgo(9));
    await setReconciledAt(bench, healthy, hoursAgo(8));
    failFor(bench, broken, { authenticate: () => new Error("boom") });
    await runReconcile(bench);
    await setReconciledAt(bench, healthy, hoursAgo(7));
    bench.spy.reset();
    failFor(bench, broken, { authenticate: () => new Error("boom") });

    await runReconcile(bench);

    const first = bench.spy.calls.find(
      (call) => touches(call.request, broken) || touches(call.request, healthy),
    );
    expect(first && touches(first.request, healthy)).toBe(true);
    expect((await reconciledAt(bench, broken))?.getTime()).toBeLessThan(hoursAgo(8).getTime());
  });
});
