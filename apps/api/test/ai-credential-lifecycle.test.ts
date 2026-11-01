import {
  LlmAbortedError,
  LlmAuthError,
  LlmBudgetExceededError,
  LlmContextTooLongError,
  LlmModelNotFoundError,
  type LlmProviderError,
  LlmProviderUnavailableError,
  LlmQuotaExceededError,
  LlmRateLimitedError,
  LlmRefusedError,
  LlmTimeoutError,
} from "@koklo/domain";
import { FakeLlm } from "@koklo/domain/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AI_ACTIONS,
  aiApi,
  aiAuditRows,
  BRIEF_REPLY,
  credentialState,
  featuresReply,
  GatedLlm,
  installAiBench,
  keyedWorld,
  setKey,
} from "./helpers/ai-bench.ts";
import { OTHER_ENCRYPTION_KEY } from "./helpers/installations.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-54b : cycle de vie de la clé BYOK pendant un appel. `LLM_NOT_CONFIGURED` (jamais d'appel),
 * `markUsed` après succès, `invalidate` sur 401 SEULEMENT (audit), compare-and-swap (D7) : une
 * rotation concurrente ne doit pas invalider la NOUVELLE clé. Le 403 n'invalide pas.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });
const diag = { operation: "complete", provider: "anthropic" } as const;

type Call = "draftBrief" | "proposeFeatures" | "verify";
const CALLS: [Call, unknown][] = [
  ["draftBrief", BRIEF_REPLY],
  ["proposeFeatures", featuresReply()],
  ["verify", "OK"],
];
const asOwner = (call: Call) => call === "verify";

async function run(
  b: ReturnType<typeof bench>,
  world: Awaited<ReturnType<typeof keyedWorld>>["world"],
  call: Call,
  app = b.app,
) {
  const api = aiApi(app, world.actors[asOwner(call) ? "owner" : "dev"]);
  return call === "verify" ? api.verify() : api[call](world.projectId);
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("clé absente, invalidée, indéchiffrable ou sans porte-clés : aucun appel au modèle", () => {
  it.each(CALLS)(
    "%s : clé absente -> 409 LLM_NOT_CONFIGURED { reason: missing }",
    async (call, reply) => {
      const b = bench();
      const { createWorld } = await import("./helpers/tickets.ts");
      const world = await createWorld(b.database);
      const fake = FakeLlm.replying(reply);
      b.use(fake);

      const res = await run(b, world, call);

      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body.code).toBe("LLM_NOT_CONFIGURED");
      expect(res.body.data).toEqual({ reason: "missing" });
      expect(fake.calls).toHaveLength(0);
      expect(await aiAuditRows(b.database, world.organizationId)).toEqual([]);
    },
  );

  it.each(CALLS)("%s : clé invalidée -> 409 { reason: invalidated }", async (call, reply) => {
    const b = bench();
    const { world } = await keyedWorld(b);
    await send(b.app, world.actors.owner.cookie, "post", "/llm-credentials/anthropic/invalidate", {
      provider: "anthropic",
    });
    const fake = FakeLlm.replying(reply);
    b.use(fake);

    const res = await run(b, world, call);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LLM_NOT_CONFIGURED");
    expect(res.body.data).toEqual({ reason: "invalidated" });
    expect(fake.calls).toHaveLength(0);
    expect(await aiAuditRows(b.database, world.organizationId)).toEqual([]);
  });

  it.each(CALLS)(
    "%s : clé chiffrée par un autre porte-clés -> 409 { reason: undecryptable }",
    async (call, reply) => {
      const b = bench();
      const { world, key } = await keyedWorld(b);
      const other = await b.makeApp({ encryptionKey: OTHER_ENCRYPTION_KEY });
      const fake = FakeLlm.replying(reply);
      b.use(fake);

      const res = await run(b, world, call, other);

      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body.data).toEqual({ reason: "undecryptable" });
      expect(JSON.stringify(res.body)).not.toContain(key);
      expect(fake.calls).toHaveLength(0);
    },
  );

  it.each(CALLS)(
    "%s : aucun porte-clés configuré -> 503 ENCRYPTION_UNAVAILABLE",
    async (call, reply) => {
      const b = bench();
      const { world } = await keyedWorld(b);
      const fake = FakeLlm.replying(reply);
      b.use(fake);

      const res = await run(b, world, call, b.appWithoutKey);

      expect(res.status, JSON.stringify(res.body)).toBe(503);
      expect(res.body.code).toBe("ENCRYPTION_UNAVAILABLE");
      expect(fake.calls).toHaveLength(0);
    },
  );

  it("remplacer une clé invalidée la ré-arme : l'appel suivant passe avec la nouvelle clé", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    await send(b.app, world.actors.owner.cookie, "post", "/llm-credentials/anthropic/invalidate", {
      provider: "anthropic",
    });
    await setKey(b.app, world, "FAKE-KEY-NOT-REAL-NEUVE-0501");
    b.use(FakeLlm.replying(BRIEF_REPLY));

    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(b.provider.keysSeen).toEqual(["FAKE-KEY-NOT-REAL-NEUVE-0501"]);
  });
});

describe("markUsed", () => {
  it.each(CALLS)("%s : last_used_at renseigné après un appel réussi", async (call, reply) => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying(reply));
    expect((await credentialState(b.database, world.organizationId))?.last_used_at).toBeNull();

    const res = await run(b, world, call);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await credentialState(b.database, world.organizationId))?.last_used_at).not.toBeNull();
  });

  it("un échec du fournisseur ne marque pas la clé comme utilisée", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.failing(new LlmProviderUnavailableError({ ...diag, status: 529 })));

    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);

    expect(res.status).toBe(502);
    expect((await credentialState(b.database, world.organizationId))?.last_used_at).toBeNull();
  });

  it("un échec de markUsed (meilleur effort) ne change pas la réponse ; il est journalisé par nom d'erreur", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying(BRIEF_REPLY));
    await b.database.query(`
      CREATE OR REPLACE FUNCTION markused_refuse() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'markUsed refusé pour le test'; END $$`);
    await b.database.query(
      "CREATE TRIGGER markused_refuse_trigger BEFORE UPDATE ON llm_provider_credentials FOR EACH ROW EXECUTE FUNCTION markused_refuse()",
    );
    try {
      const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.brief).toEqual(BRIEF_REPLY);
      expect(b.lines.join("\n")).toContain("LlmCredentialStoreError");
    } finally {
      await b.database.query("DROP TRIGGER markused_refuse_trigger ON llm_provider_credentials");
    }
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("LlmAuthError : 401 invalide la clé (avec audit), 403 non", () => {
  it.each(CALLS)(
    "%s : 401 -> LLM_PROVIDER_ERROR { reason: auth }, clé invalidée, audit llm_credential.invalidate",
    async (call, reply) => {
      const b = bench();
      const { world } = await keyedWorld(b);
      const fake = FakeLlm.failing(new LlmAuthError({ ...diag, status: 401 }));
      b.use(fake);

      const res = await run(b, world, call);

      expect(res.status, JSON.stringify(res.body)).toBe(502);
      expect(res.body.code).toBe("LLM_PROVIDER_ERROR");
      expect(res.body.data).toEqual({ reason: "auth" });
      const state = await credentialState(b.database, world.organizationId);
      expect(state?.invalidated_at).not.toBeNull();
      const audit = await b.database.query<{
        action: string;
        actor_id: string;
        target_kind: string;
        target_id: string;
      }>(
        "SELECT action, actor_id, target_kind, target_id FROM audit_log WHERE organization_id = $1 AND action = 'llm_credential.invalidate'",
        [world.organizationId],
      );
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actor_id: world.actors[asOwner(call) ? "owner" : "dev"].userId,
        target_kind: "llm_credential",
        target_id: state?.id,
      });
      // La clé invalidée n'est plus utilisée : l'appel suivant ne part pas.
      b.use(FakeLlm.replying(reply));
      const again = await run(b, world, call);
      expect(again.status).toBe(409);
      expect(again.body.data).toEqual({ reason: "invalidated" });
      expect(b.provider.keysSeen).toHaveLength(1);
    },
  );

  it.each(CALLS)(
    "%s : 403 -> LLM_PROVIDER_ERROR { reason: auth }, clé INTACTE, aucun audit d'invalidation",
    async (call) => {
      const b = bench();
      const { world } = await keyedWorld(b);
      b.use(FakeLlm.failing(new LlmAuthError({ ...diag, status: 403 })));

      const res = await run(b, world, call);

      expect(res.status).toBe(502);
      expect(res.body.data).toEqual({ reason: "auth" });
      expect((await credentialState(b.database, world.organizationId))?.invalidated_at).toBeNull();
      const rows = await b.database.query(
        "SELECT 1 FROM audit_log WHERE organization_id = $1 AND action = 'llm_credential.invalidate'",
        [world.organizationId],
      );
      expect(rows).toHaveLength(0);
    },
  );

  it("une LlmAuthError sans statut n'invalide pas non plus (seul le 401 explicite compte)", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.failing(new LlmAuthError(diag)));

    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);

    expect(res.status).toBe(502);
    expect((await credentialState(b.database, world.organizationId))?.invalidated_at).toBeNull();
  });
});

describe("D7 : compare-and-swap, une rotation concurrente n'est pas invalidée", () => {
  async function rotateDuringCall(call: Call) {
    const b = bench();
    const { world } = await keyedWorld(b);
    const newKey = "FAKE-KEY-NOT-REAL-ROTATION-0601";
    const gated = new GatedLlm(new FakeLlm());
    // Pendant l'appel, l'owner remplace la clé ; le fournisseur répond ensuite 401 (ancienne clé).
    gated.onCall = async () => {
      await setKey(b.app, world, newKey);
      gated.release();
      throw new LlmAuthError({ ...diag, status: 401 });
    };
    b.use(gated);
    const res = await run(b, world, call);
    return { b, world, newKey, res };
  }

  it.each(["draftBrief", "verify"] as const)(
    "%s : la nouvelle clé reste valide, aucun audit d'invalidation",
    async (call) => {
      const { b, world, newKey, res } = await rotateDuringCall(call);

      expect(res.status, JSON.stringify(res.body)).toBe(502);
      expect(res.body.data).toEqual({ reason: "auth" });
      expect((await credentialState(b.database, world.organizationId))?.invalidated_at).toBeNull();
      const rows = await b.database.query(
        "SELECT 1 FROM audit_log WHERE organization_id = $1 AND action = 'llm_credential.invalidate'",
        [world.organizationId],
      );
      expect(rows).toHaveLength(0);

      // L'appel suivant utilise la nouvelle clé et réussit.
      b.use(FakeLlm.replying(call === "verify" ? "OK" : BRIEF_REPLY));
      const next = await run(b, world, call);
      expect(next.status, JSON.stringify(next.body)).toBe(200);
      expect(b.provider.keysSeen.at(-1)).toBe(newKey);
    },
  );
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("table d'erreurs du port -> erreurs typées du contrat", () => {
  const TABLE: [string, () => LlmProviderError, number, string, unknown][] = [
    [
      "LlmQuotaExceededError",
      () => new LlmQuotaExceededError(diag),
      502,
      "LLM_PROVIDER_ERROR",
      { reason: "quota" },
    ],
    [
      "LlmTimeoutError",
      () => new LlmTimeoutError(diag),
      502,
      "LLM_PROVIDER_ERROR",
      { reason: "timeout" },
    ],
    [
      "LlmAbortedError",
      () => new LlmAbortedError(diag),
      502,
      "LLM_PROVIDER_ERROR",
      { reason: "aborted" },
    ],
    [
      "LlmBudgetExceededError",
      () => new LlmBudgetExceededError({ ...diag, limit: "cost" }),
      502,
      "LLM_PROVIDER_ERROR",
      { reason: "budget" },
    ],
    [
      "LlmContextTooLongError",
      () => new LlmContextTooLongError(diag),
      502,
      "LLM_PROVIDER_ERROR",
      { reason: "context_too_long" },
    ],
    [
      "LlmRefusedError",
      () => new LlmRefusedError(diag),
      502,
      "LLM_PROVIDER_ERROR",
      { reason: "refused" },
    ],
    [
      "LlmModelNotFoundError",
      () => new LlmModelNotFoundError(diag),
      502,
      "LLM_PROVIDER_ERROR",
      { reason: "model_not_found" },
    ],
    [
      "LlmProviderUnavailableError",
      () => new LlmProviderUnavailableError({ ...diag, status: 529 }),
      502,
      "LLM_PROVIDER_ERROR",
      { reason: "unavailable" },
    ],
    [
      "LlmRateLimitedError (2,5 s)",
      () => new LlmRateLimitedError({ ...diag, retryAfterMs: 2500 }),
      429,
      "LLM_RATE_LIMITED",
      { retryAfterSeconds: 3 },
    ],
    [
      "LlmRateLimitedError (0 ms)",
      () => new LlmRateLimitedError({ ...diag, retryAfterMs: 0 }),
      429,
      "LLM_RATE_LIMITED",
      { retryAfterSeconds: 1 },
    ],
    [
      "LlmRateLimitedError (plafond d'une heure)",
      () => new LlmRateLimitedError({ ...diag, retryAfterMs: 99_999_999 }),
      429,
      "LLM_RATE_LIMITED",
      { retryAfterSeconds: 3600 },
    ],
  ];

  it.each(TABLE)("%s", async (_name, error, status, code, data) => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.failing(error()));

    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);

    expect(res.status, JSON.stringify(res.body)).toBe(status);
    expect(res.body.code).toBe(code);
    expect(res.body.data).toEqual(data);
    expect((await credentialState(b.database, world.organizationId))?.invalidated_at).toBeNull();
    expect((await credentialState(b.database, world.organizationId))?.last_used_at).toBeNull();
    // Une dépense tentée reste tracée : la ligne d'audit existe même si le fournisseur échoue.
    expect(await aiAuditRows(b.database, world.organizationId)).toHaveLength(1);
  });

  it("verify suit la même table", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.failing(new LlmTimeoutError(diag)));

    const res = await aiApi(b.app, world.actors.owner).verify();

    expect(res.status).toBe(502);
    expect(res.body.data).toEqual({ reason: "timeout" });
    const rows = await aiAuditRows(b.database, world.organizationId);
    expect(rows.map((row) => row.action)).toEqual([AI_ACTIONS.verify]);
  });
});
