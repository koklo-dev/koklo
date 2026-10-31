import { GitProviderUnavailableError } from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditRowsFull } from "./helpers/comments.ts";
import {
  BRANCH,
  batch,
  batchApi,
  batchRows,
  createOp,
  installSpecBench,
  specScene,
  submitOk,
} from "./helpers/spec-batch.ts";

/**
 * TK-44b §7 : aucun secret (jeton d'installation, clé de l'App) ni identifiant interne d'utilisateur
 * dans les sorties, journaux, lignes de base, audit et payload pg-boss.
 */
const bench = installSpecBench({ beforeAll, afterAll, beforeEach });

function tokensOf(calls: { method: string; result?: unknown }[]): string[] {
  return calls
    .filter((call) => call.method === "authenticate")
    .map((call) => (call.result as { token?: string } | undefined)?.token ?? "")
    .filter((token) => token.length > 0);
}

describe("aucune fuite de secret ni d'identifiant interne", () => {
  it("jetons du fournisseur absents des réponses, journaux, lots, opérations, audit et file", async () => {
    const b = bench();
    const s = await specScene(b);
    const ok = await submitOk(b, s, [createOp("Visible")]);
    const failed = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([createOp("Fautif", { tables: ["T-x"] })], { branch: BRANCH }),
    );
    const got = await batchApi(b.app, s.world.actors.dev).get(s.projectId, ok.id);

    const tokens = tokensOf(b.harness.calls);
    expect(tokens.length).toBeGreaterThan(0);
    const haystacks = {
      réponses: JSON.stringify([ok, failed.body, got.body]),
      journaux: b.logs.join("\n"),
      lots: JSON.stringify(await batchRows(b.database, s.projectId)),
      opérations: JSON.stringify(
        await b.database.query("SELECT * FROM spec_write_operations WHERE organization_id = $1", [
          s.world.organizationId,
        ]),
      ),
      audit: JSON.stringify(await auditRowsFull(b.database, s.world.organizationId)),
      file: JSON.stringify(
        await b.database.query("SELECT data FROM pgboss.job WHERE name = 'spec-write'"),
      ),
    };
    for (const [where, text] of Object.entries(haystacks)) {
      for (const token of tokens) expect(text, where).not.toContain(token);
    }
  });
});

describe("aucune fuite de secret ni d'identifiant interne (suite 2)", () => {
  it("le payload du job ne contient que batchId", async () => {
    const b = bench();
    const s = await specScene(b);
    const ok = await submitOk(b, s, [createOp("Payload")]);

    const jobs = await b.database.query<{ data: Record<string, unknown> }>(
      "SELECT data FROM pgboss.job WHERE name = 'spec-write' AND data->>'batchId' = $1",
      [ok.id],
    );

    expect(jobs.length).toBeGreaterThanOrEqual(1);
    for (const job of jobs) expect(job.data).toEqual({ batchId: ok.id });
  });

  it("authorUserId n'est jamais exposé, ni dans le lot rendu ni dans l'erreur typée", async () => {
    const b = bench();
    const s = await specScene(b);
    const dev = s.world.actors.dev;
    const ok = await submitOk(b, s, [createOp("Anonyme")]);
    const bad = await batchApi(b.app, dev).submit(
      s.projectId,
      batch([createOp("Fautif", { tables: ["T-x"] })], { branch: BRANCH }),
    );

    for (const body of [ok, bad.body]) {
      expect(JSON.stringify(body)).not.toContain(dev.userId);
      expect(JSON.stringify(body)).not.toContain("authorUserId");
      expect(JSON.stringify(body)).not.toContain("author_user_id");
    }
  });
});

describe("aucune fuite de secret ni d'identifiant interne (suite 3)", () => {
  it("une panne prolongée du fournisseur : lot failed PROVIDER_UNAVAILABLE rendu en 503, sans message brut ni jeton", async () => {
    const b = bench();
    const s = await specScene(b);
    const raw = "SECRET-RAW-BODY ghs_leak";
    b.harness.failWith(
      "writeCommit",
      Object.assign(new GitProviderUnavailableError({ operation: "writeCommit" }), { detail: raw }),
    );

    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([createOp("Panne")], { branch: BRANCH }),
    );

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("PROVIDER_UNAVAILABLE");
    await vi.waitFor(async () => {
      const [row] = await batchRows(b.database, s.projectId);
      expect(row).toMatchObject({ status: "failed", error_code: "PROVIDER_UNAVAILABLE" });
    });
    const text = JSON.stringify([res.body, await batchRows(b.database, s.projectId), b.logs]);
    expect(text).not.toContain("ghs_leak");
    expect(text).not.toContain("SECRET-RAW-BODY");
  });
});
