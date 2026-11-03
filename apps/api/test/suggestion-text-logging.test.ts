import * as Sentry from "@sentry/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import { ManualClock } from "./helpers/leases.ts";
import { containsSecret, makeSentinel } from "./helpers/llm-credentials.ts";
import type { RepoBench } from "./helpers/repo-scene.ts";
import { createRepoApp, installAuditFailTrigger, ProviderHarness } from "./helpers/repos.ts";
import { createSuggestionScene, suggestionApi } from "./helpers/suggestions.ts";

vi.mock("@sentry/node", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@sentry/node")>()),
  captureException: vi.fn(),
}));

/**
 * TK-55c NON-JOURNALISATION (sentinelle calquée sur `llm-credential-set-logging`) : le corps d'une
 * suggestion et la note d'une décision n'apparaissent JAMAIS dans les journaux applicatifs, la
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
describe("niveau trace : les textes ne sont jamais journalisés", () => {
  it("création, doublon, décision avec note, retrait : ni journaux, ni Sentry, ni audit, ni notifications", async () => {
    const scene = await createSuggestionScene(bench);
    const client = suggestionApi(bench.app, scene.c1);
    const owner = suggestionApi(bench.app, scene.p1.world.actors.owner);
    const p1 = scene.p1.projectId;

    const text = await captured(async () => {
      const created = await client.create(p1, { body: `${sentinel} corps` });
      expect(created.status, JSON.stringify(created.body)).toBe(200);
      await client.create(p1, { body: `${sentinel} corps` });
      const other = await client.create(p1, { body: `${sentinel} à retirer` });
      const accepted = await owner.accept(p1, created.body.id, { note: `${sentinel} note` });
      expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
      await client.withdraw(p1, other.body.id);
      await client.list(p1);
    });

    expect(lines.length, "le journal de requêtes existe").toBeGreaterThan(0);
    expect(containsSecret(text, sentinel), "journaux, sortie standard ou Sentry").toBe(false);
    expect(containsSecret(await elsewhere(scene.p1.organizationId), sentinel)).toBe(false);
  });

  it("refus (422, 403, 404, 409) : le texte envoyé n'est ni journalisé ni renvoyé", async () => {
    const scene = await createSuggestionScene(bench);
    const client = suggestionApi(bench.app, scene.c1);
    const p1 = scene.p1.projectId;
    const created = await client.create(p1, { body: "Pour le 409" });
    await suggestionApi(bench.app, scene.p1.world.actors.owner).reject(p1, created.body.id);
    const results: { text: string; status: number }[] = [];

    const text = await captured(async () => {
      results.push(
        await client.create(p1, { body: `${sentinel}\u0000` }),
        await client.create(p1, { body: `${sentinel}${"x".repeat(5000)}` }),
        await suggestionApi(bench.app, scene.p1.world.actors.business).create(p1, {
          body: sentinel,
        }),
        await client.create(scene.p2.projectId, { body: sentinel }),
        await client.createFeature(p1, "F-999", { body: sentinel }),
        await suggestionApi(bench.app, scene.p1.world.actors.designer).accept(p1, created.body.id, {
          note: sentinel,
        }),
        await suggestionApi(bench.app, scene.p1.world.actors.owner).accept(p1, created.body.id, {
          note: sentinel,
        }),
      );
    });

    expect(results.map((res) => res.status)).toEqual([422, 422, 403, 404, 404, 403, 409]);
    expect(containsSecret(text, sentinel)).toBe(false);
    for (const res of results)
      expect(containsSecret(res.text, sentinel), "réponse d'erreur").toBe(false);
    expect(containsSecret(await elsewhere(scene.p1.organizationId), sentinel)).toBe(false);
  });

  it("500 (échec d'audit) : l'erreur interne et Sentry ne portent pas le texte", async () => {
    const scene = await createSuggestionScene(bench);
    await bench.database.query("INSERT INTO audit_fail (action) VALUES ('suggestion.create')");
    const results: { text: string; status: number }[] = [];

    const text = await captured(async () => {
      results.push(
        await suggestionApi(bench.app, scene.c1).create(scene.p1.projectId, { body: sentinel }),
      );
    });

    expect(results[0]?.status).toBe(500);
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalled();
    expect(containsSecret(text, sentinel)).toBe(false);
    expect(containsSecret(results[0]?.text ?? "", sentinel)).toBe(false);
  });
});
