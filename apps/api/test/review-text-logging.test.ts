import * as Sentry from "@sentry/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import { ManualClock } from "./helpers/leases.ts";
import { containsSecret, makeSentinel } from "./helpers/llm-credentials.ts";
import type { RepoBench } from "./helpers/repo-scene.ts";
import { createRepoApp, installAuditFailTrigger, ProviderHarness } from "./helpers/repos.ts";
import { createReviewScene, reviewApi, seedProposedBaseline } from "./helpers/reviews.ts";

vi.mock("@sentry/node", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@sentry/node")>()),
  captureException: vi.fn(),
}));

/**
 * TK-55d NON-JOURNALISATION (sentinelle calquée sur `llm-credential-set-logging`) : le commentaire d'une
 * review n'apparaît JAMAIS dans les journaux applicatifs, la
 * sortie standard, Sentry, le journal d'audit ni les notifications, au niveau `trace`, pour chaque
 * issue (succès, doublon, 422, 403, 404, 409, 500 par échec d'audit). Seule la réponse au client le
 * contient (et la table des suggestions).
 */
const sentinel = makeSentinel();
const lines: string[] = [];
let bench: RepoBench;

beforeAll(async () => {
  const database = await createSeededDatabase();
  await installAuditFailTrigger(database);
  const clock = new ManualClock();
  const harness = await ProviderHarness.create(clock);
  harness.watchTransactions(database);
  const app = await createRepoApp(database.url, {
    clock,
    provider: harness.provider,
    logStream: { write: (line: string) => void lines.push(line) },
    config: { logLevel: "trace" },
  });
  bench = { database, app, clock, harness, credentials: undefined as never };
}, 180_000);

afterAll(async () => {
  await bench?.app.close();
  await bench?.database.dispose();
}, 60_000);

beforeEach(async () => {
  vi.clearAllMocks();
  lines.length = 0;
  await bench.database.query("DELETE FROM audit_fail");
});

/** Exécute `run` en capturant stdout, stderr, le journal applicatif et Sentry. */
async function captured(run: () => Promise<unknown>): Promise<string> {
  const out: string[] = [];
  const spies = [process.stdout, process.stderr].map((stream) =>
    vi.spyOn(stream, "write").mockImplementation(((chunk: unknown) => {
      out.push(String(chunk));
      return true;
    }) as typeof stream.write),
  );
  try {
    await run();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  const sentry = vi
    .mocked(Sentry.captureException)
    .mock.calls.map(([e, c]) => [String(e), (e as Error)?.stack, (e as Error)?.cause, c]);
  return [lines.join("\n"), out.join("\n"), JSON.stringify(sentry)].join("\n");
}

async function elsewhere(organizationId: string): Promise<string> {
  const tables = ["audit_log", "notifications"];
  const rows = await Promise.all(
    tables.map((table) =>
      bench.database.query(
        `SELECT row_to_json(t)::text AS row FROM ${table} t WHERE organization_id = $1`,
        [organizationId],
      ),
    ),
  );
  return JSON.stringify(rows);
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("niveau trace : le commentaire n'est jamais journalisé", () => {
  it("validation, rejeu, baseline : ni journaux, ni Sentry, ni audit, ni notifications", async () => {
    const scene = await createReviewScene(bench);
    await seedProposedBaseline(bench.database, scene.p1, scene.headP1);
    const client = reviewApi(bench.app, scene.c1);
    const p1 = scene.p1.projectId;

    const text = await captured(async () => {
      const ok = await client.submit(p1, scene.headP1, { comment: `${sentinel} avis` });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      await client.submit(p1, scene.headP1, { comment: `${sentinel} avis` });
      await client.submitBaseline(p1, scene.headP1, { comment: `${sentinel} baseline` });
      await reviewApi(bench.app, scene.p1.world.actors.owner).list(p1);
    });

    expect(lines.length, "le journal de requêtes existe").toBeGreaterThan(0);
    expect(containsSecret(text, sentinel), "journaux, sortie standard ou Sentry").toBe(false);
    expect(containsSecret(await elsewhere(scene.p1.organizationId), sentinel)).toBe(false);
  });

  it("refus (422, 403, 404, 409) : le texte envoyé n'est ni journalisé ni renvoyé", async () => {
    const scene = await createReviewScene(bench);
    const client = reviewApi(bench.app, scene.c1);
    const p1 = scene.p1.projectId;
    const results: { text: string; status: number }[] = [];

    const text = await captured(async () => {
      results.push(
        await client.submit(p1, scene.headP1, { comment: `${sentinel}\u0000` }),
        await reviewApi(bench.app, scene.p1.world.actors.owner).submit(p1, scene.headP1, {
          comment: sentinel,
        }),
        await reviewApi(bench.app, scene.c2).submit(p1, scene.headP1, { comment: sentinel }),
        await client.submit(p1, "0".repeat(40), { comment: sentinel }),
        await client.submit(p1, scene.headP1, { targetRef: "F-999", comment: sentinel }),
      );
    });

    expect(results.map((res) => res.status)).toEqual([422, 403, 404, 409, 404]);
    expect(containsSecret(text, sentinel)).toBe(false);
    for (const res of results)
      expect(containsSecret(res.text, sentinel), "réponse d'erreur").toBe(false);
    expect(containsSecret(await elsewhere(scene.p1.organizationId), sentinel)).toBe(false);
  });

  it("500 (échec d'audit) : l'erreur interne et Sentry ne portent pas le texte", async () => {
    const scene = await createReviewScene(bench);
    await bench.database.query("INSERT INTO audit_fail (action) VALUES ('review.approve')");
    const results: { text: string; status: number }[] = [];

    const text = await captured(async () => {
      results.push(
        await reviewApi(bench.app, scene.c1).submit(scene.p1.projectId, scene.headP1, {
          comment: sentinel,
        }),
      );
    });

    expect(results[0]?.status).toBe(500);
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalled();
    expect(containsSecret(text, sentinel)).toBe(false);
    expect(containsSecret(results[0]?.text ?? "", sentinel)).toBe(false);
  });
});
