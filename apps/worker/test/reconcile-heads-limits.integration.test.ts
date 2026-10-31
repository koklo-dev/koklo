import {
  GitAuthExpiredError,
  GitProviderUnavailableError,
  GitRateLimitedError,
} from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetBench, runReconcile } from "./support/reconcile-bench.ts";
import {
  callsFor,
  clearRepos,
  failFor,
  hoursAgo,
  reconciledAt,
  setReconciledAt,
} from "./support/reconcile-heads-bench.ts";
import { WebhookBench, type WebhookScene } from "./support/webhook-bench.ts";

/**
 * TK-46c AC-11 `reconcile-rate-limit-stops-cleanly` : limite de débit = arrêt propre de P4 (le run ne
 * lève pas), dépôt interrompu non avancé, reprise au tick suivant ; budget d'appels fournisseur par
 * run ; rotation par `last_reconciled_at` (NULL d'abord) ; erreur fournisseur = dépôt sauté.
 */
const BUDGET = 10;
let bench: WebhookBench;

beforeAll(async () => {
  bench = await WebhookBench.create();
  await bench.start({ reconcileMaxProviderCalls: BUDGET });
}, 240_000);
afterAll(async () => {
  await bench?.dispose();
});
beforeEach(async () => {
  await resetBench(bench);
  await clearRepos(bench);
});

const rateLimited = () => new GitRateLimitedError({ operation: "listFiles", retryAfterMs: 60_000 });

describe("reconcile-rate-limit-stops-cleanly", () => {
  it("limite de débit sur le 2e dépôt : le run se termine, le 1er est avancé, le 2e non, rien après lui", async () => {
    const first = await bench.scene();
    const limited = await bench.scene();
    const last = await bench.scene();
    await setReconciledAt(bench, first, hoursAgo(9));
    await setReconciledAt(bench, limited, hoursAgo(8));
    await setReconciledAt(bench, last, hoursAgo(7));
    failFor(bench, limited, { listFiles: rateLimited });

    const summary = await runReconcile(bench);

    expect(summary.heads?.stopped).toBe("rate_limited");
    expect(summary.failedPasses ?? []).toEqual([]);
    expect((await reconciledAt(bench, first))?.getTime()).toBeGreaterThan(hoursAgo(1).getTime());
    expect((await reconciledAt(bench, limited))?.getTime()).toBeLessThan(hoursAgo(7).getTime());
    expect((await reconciledAt(bench, last))?.getTime()).toBeLessThan(hoursAgo(6).getTime());
    expect(callsFor(bench, last)).toEqual([]);
  });

  it("reprise au tick suivant : le dépôt interrompu est traité en premier, puis avancé", async () => {
    const limited = await bench.scene();
    const other = await bench.scene();
    await setReconciledAt(bench, limited, hoursAgo(8));
    await setReconciledAt(bench, other, hoursAgo(7));
    failFor(bench, limited, { listFiles: rateLimited });
    await runReconcile(bench);
    bench.spy.reset();

    const summary = await runReconcile(bench);

    expect(summary.heads?.stopped).toBeNull();
    expect((await reconciledAt(bench, limited))?.getTime()).toBeGreaterThan(hoursAgo(1).getTime());
    expect((await reconciledAt(bench, other))?.getTime()).toBeGreaterThan(hoursAgo(1).getTime());
    expect(await bench.headSha(limited, "main")).toBeDefined();
  });

  it("limite de débit à l'authentification : même arrêt propre", async () => {
    const limited = await bench.scene();
    await setReconciledAt(bench, limited, hoursAgo(5));
    failFor(bench, limited, { authenticate: rateLimited });

    const summary = await runReconcile(bench);

    expect(summary.heads?.stopped).toBe("rate_limited");
    expect((await reconciledAt(bench, limited))?.getTime()).toBeLessThan(hoursAgo(4).getTime());
  });
});

describe("budget d'appels et rotation", () => {
  it("jamais plus de RECONCILE_MAX_PROVIDER_CALLS appels, les plus anciens d'abord, tous servis en quelques runs", async () => {
    const scenes: WebhookScene[] = [await bench.scene()];
    for (let i = 0; i < 5; i++) scenes.push(await bench.scene());
    // scenes[0] : jamais réconcilié (NULL d'abord) ; les suivantes de plus en plus récentes.
    await setReconciledAt(bench, scenes[0] as WebhookScene, null);
    for (const [index, scene] of scenes.slice(1).entries()) {
      await setReconciledAt(bench, scene, hoursAgo(20 - index));
    }
    const mark = new Date();
    bench.spy.reset();

    const first = await runReconcile(bench);

    expect(bench.spy.calls.length).toBeLessThanOrEqual(BUDGET);
    expect(first.heads?.stopped).toBe("budget");
    expect(first.failedPasses ?? []).toEqual([]);
    const advanced = await Promise.all(
      scenes.map(async (scene) => ((await reconciledAt(bench, scene)) ?? new Date(0)) >= mark),
    );
    expect(advanced[0]).toBe(true);
    expect(advanced.filter(Boolean).length).toBeLessThan(scenes.length);
    // Préfixe : aucun dépôt avancé n'est plus récent qu'un dépôt laissé.
    const firstLeft = advanced.indexOf(false);
    expect(advanced.slice(firstLeft).some(Boolean)).toBe(false);

    for (let run = 0; run < scenes.length && advanced.includes(false); run++) {
      bench.spy.reset();
      await runReconcile(bench);
      expect(bench.spy.calls.length).toBeLessThanOrEqual(BUDGET);
      for (const [index, scene] of scenes.entries()) {
        advanced[index] = ((await reconciledAt(bench, scene)) ?? new Date(0)) >= mark;
      }
    }
    expect(advanced.every(Boolean)).toBe(true);
  });
});

describe("erreur fournisseur : le dépôt est sauté, la passe continue", () => {
  const errors: [string, () => unknown][] = [
    ["erreur générique", () => new Error("boom")],
    [
      "jeton expiré",
      () =>
        new GitAuthExpiredError({
          operation: "authenticate",
          kind: "installation",
          refreshable: true,
        }),
    ],
    ["fournisseur indisponible", () => new GitProviderUnavailableError({ operation: "listFiles" })],
  ];

  it.each(errors)(
    "%s : dépôt sauté et non avancé, le suivant est traité, passe non en échec",
    async (_name, error) => {
      const broken = await bench.scene();
      const healthy = await bench.scene();
      await setReconciledAt(bench, broken, hoursAgo(8));
      await setReconciledAt(bench, healthy, hoursAgo(7));
      failFor(bench, broken, { authenticate: error });

      const summary = await runReconcile(bench);

      expect(summary.failedPasses ?? []).toEqual([]);
      expect(summary.heads?.skipped).toBeGreaterThanOrEqual(1);
      expect(summary.heads?.stopped).toBeNull();
      expect((await reconciledAt(bench, broken))?.getTime()).toBeLessThan(hoursAgo(7).getTime());
      expect((await reconciledAt(bench, healthy))?.getTime()).toBeGreaterThan(
        hoursAgo(1).getTime(),
      );
      expect(await bench.headSha(healthy, "main")).toBeDefined();
    },
  );
});
