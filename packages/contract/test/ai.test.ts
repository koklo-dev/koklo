import { describe, expect, it } from "vitest";
import * as api from "../src/index.ts";
import { generateOpenApi } from "../src/index.ts";
import { errors, INSTANT, input, isValid, output, parsed, proc, UUID } from "./support.ts";

/**
 * TK-54b (contrat 0.9.0, additif) : groupe `ai` (propositions non persistées, jamais d'écriture),
 * `llmCredential.verify` et cinq erreurs typées. Les noms, bornes et formes figent
 * `.workflow/TK-54/02-decisions-54b.md` §2.
 */
const NAMES = ["draftBrief", "proposeCriteria", "proposeFeatures"];
const META = {
  provider: "anthropic",
  model: "claude-test-1",
  usage: { inputTokens: 10, outputTokens: 20 },
};
const STEPS = [
  { type: "etant_donne", text: "un visiteur connecté" },
  { type: "quand", text: "il ouvre la page" },
  { type: "alors", text: "la liste s'affiche" },
];
const CRITERION = { title: "Affichage de la liste", steps: STEPS };
const FEATURE = {
  kind: "feature.create",
  title: "Liste des tickets",
  priority: "should",
  description: "Afficher les tickets du projet.",
  criteria: [CRITERION],
};
const BRIEF = {
  title: "Un titre",
  problem: "Le problème.",
  users: "Les utilisateurs.",
  expectedOutcome: "Le résultat.",
  constraints: "",
  openQuestions: ["Quelle échéance ?"],
};

const submitWith = (operations: unknown[]) => ({
  projectId: UUID,
  idempotencyKey: "ai-1",
  operations,
});

type Doc = {
  info: { version: string };
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
};
const doc = async () => (await generateOpenApi()) as unknown as Doc;

describe("AI1 surface : le groupe ai et llmCredential.verify", () => {
  it("le routeur expose exactement draftBrief, proposeCriteria, proposeFeatures", () => {
    const group = (api.contract as unknown as Record<string, object>).ai;
    expect(group).toBeDefined();
    expect(Object.keys(group ?? {}).sort()).toEqual(NAMES);
  });

  it.each([
    ["ai.draftBrief", "post", "/projects/{projectId}/ai/brief"],
    ["ai.proposeFeatures", "post", "/projects/{projectId}/ai/features"],
    ["ai.proposeCriteria", "post", "/projects/{projectId}/ai/criteria"],
    ["llmCredential.verify", "post", "/llm-credentials/{provider}/verify"],
  ])("%s : %s %s dans l'OpenAPI", async (name, method, path) => {
    expect(proc(name)).toBeDefined();
    expect((await doc()).paths[path]?.[method], `${method} ${path}`).toBeDefined();
  });

  it("aucune de ces routes n'est une écriture de spec : pas de GET, pas de PUT ni DELETE", async () => {
    const d = await doc();
    for (const path of [
      "/projects/{projectId}/ai/brief",
      "/projects/{projectId}/ai/features",
      "/projects/{projectId}/ai/criteria",
    ]) {
      expect(Object.keys(d.paths[path] ?? {})).toEqual(["post"]);
    }
  });

  it("l'OpenAPI est en 0.9.0, jamais en 0.10.0 (réservée à TK-55)", async () => {
    expect((await doc()).info.version).toBe("0.9.0");
  });

  it("featureCreateSchema est exporté (parité avec specBatch.submit)", () => {
    expect((api as Record<string, unknown>).featureCreateSchema).toBeDefined();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("AI2 entrées : aucune entrée ne choisit le modèle ni le budget", () => {
  const brief = (over: Record<string, unknown>) =>
    isValid(input("ai.draftBrief"), { projectId: UUID, idea: "Une idée", ...over });

  it("draftBrief : idée 1 à 8000 caractères, réponses au plus 10 de 1000", async () => {
    expect(await brief({})).toBe(true);
    expect(await brief({ idea: "x".repeat(8000) })).toBe(true);
    expect(await brief({ idea: "x".repeat(8001) })).toBe(false);
    expect(await brief({ idea: "" })).toBe(false);
    expect(await brief({ idea: "   \n\t " })).toBe(false);
    expect(await brief({ answers: ["a"] })).toBe(true);
    expect(await brief({ answers: Array.from({ length: 11 }, () => "a") })).toBe(false);
    expect(await brief({ answers: ["x".repeat(1001)] })).toBe(false);
    expect(await brief({ answers: [""] })).toBe(false);
    expect(await isValid(input("ai.draftBrief"), { idea: "Une idée" })).toBe(false);
    expect(await brief({ projectId: "pas-un-uuid" })).toBe(false);
  });

  it("proposeFeatures : brief 1 à 20000 caractères, maxFeatures entier 1 à 20", async () => {
    const run = (over: Record<string, unknown>) =>
      isValid(input("ai.proposeFeatures"), { projectId: UUID, brief: "Un brief", ...over });
    expect(await run({})).toBe(true);
    expect(await run({ brief: "x".repeat(20_000) })).toBe(true);
    expect(await run({ brief: "x".repeat(20_001) })).toBe(false);
    expect(await run({ brief: "  " })).toBe(false);
    for (const ok of [1, 8, 20]) expect(await run({ maxFeatures: ok }), String(ok)).toBe(true);
    for (const bad of [0, 21, 1.5, -1, "8"]) {
      expect(await run({ maxFeatures: bad }), String(bad)).toBe(false);
    }
  });

  it("proposeCriteria : specId au motif F-nnn", async () => {
    const run = (specId: unknown) =>
      isValid(input("ai.proposeCriteria"), { projectId: UUID, specId });
    expect(await run("F-001")).toBe(true);
    for (const bad of ["F-1", "f-001", "AC-1", "", 1, undefined]) {
      expect(await run(bad), String(bad)).toBe(false);
    }
  });

  it.each(["ai.draftBrief", "ai.proposeFeatures", "ai.proposeCriteria"])(
    "%s : model, budget, maxOutputTokens, provider, apiKey et nonce ne sont jamais conservés",
    async (name) => {
      const base: Record<string, unknown> = {
        projectId: UUID,
        specId: "F-001",
        brief: "b",
        idea: "i",
      };
      const value = await parsed(input(name), {
        ...base,
        model: "un-autre-modele",
        budget: { maxOutputTokens: 32_000 },
        maxOutputTokens: 32_000,
        provider: "openai",
        apiKey: "FAKE-KEY-NOT-REAL-0123",
        nonce: "a".repeat(48),
      });
      expect(value, name).toBeDefined();
      for (const key of ["model", "budget", "maxOutputTokens", "provider", "apiKey", "nonce"]) {
        expect(value, `${name}.${key}`).not.toHaveProperty(key);
      }
    },
  );

  it("verify : accepte les identifiants du domaine, refuse fake", async () => {
    const run = (provider: string) => isValid(input("llmCredential.verify"), { provider });
    expect(await run("anthropic")).toBe(true);
    expect(await run("fake")).toBe(false);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("AI3 sorties : des propositions directement soumettables", () => {
  it("draftBrief : { brief, meta } aux champs bornés", async () => {
    const out = output("ai.draftBrief");
    expect(await isValid(out, { brief: BRIEF, meta: META })).toBe(true);
    expect(await isValid(out, { brief: { ...BRIEF, title: "" }, meta: META })).toBe(false);
    expect(await isValid(out, { brief: { ...BRIEF, title: "x".repeat(201) }, meta: META })).toBe(
      false,
    );
    expect(
      await isValid(out, { brief: { ...BRIEF, openQuestions: Array(11).fill("q") }, meta: META }),
    ).toBe(false);
    expect(await isValid(out, { brief: BRIEF })).toBe(false);
  });

  it("proposeFeatures : 1 à 20 éléments feature.create, doublons signalés à part", async () => {
    const out = output("ai.proposeFeatures");
    expect(await isValid(out, { features: [FEATURE], duplicates: [], meta: META })).toBe(true);
    expect(
      await isValid(out, {
        features: [FEATURE],
        duplicates: [{ index: 0, specId: "F-001" }],
        meta: META,
      }),
    ).toBe(true);
    expect(await isValid(out, { features: [], duplicates: [], meta: META })).toBe(false);
    expect(
      await isValid(out, { features: Array(21).fill(FEATURE), duplicates: [], meta: META }),
    ).toBe(false);
    expect(
      await isValid(out, {
        features: [{ ...FEATURE, kind: "feature.delete" }],
        duplicates: [],
        meta: META,
      }),
    ).toBe(false);
  });

  it("une proposition ne porte ni liens (tables, endpoints, écrans, rôles, règles, nfr) ni statut", async () => {
    const out = output("ai.proposeFeatures");
    for (const extra of [
      { tables: ["T-user"] },
      { endpoints: ["E-login"] },
      { screens: ["S-login"] },
      { roles: ["RL-owner"] },
      { rules: ["R-001"] },
      { nfr: ["NFR-perf"] },
      { status: "specifiee" },
    ]) {
      const value = await parsed(out, {
        features: [{ ...FEATURE, ...extra }],
        duplicates: [],
        meta: META,
      });
      const kept = (value?.features as Record<string, unknown>[] | undefined)?.[0] ?? {};
      expect(
        Object.keys(extra).some((key) => key in kept),
        JSON.stringify(extra),
      ).toBe(false);
    }
  });

  it("bornes d'un critère : 1 à 12 critères, 3 à 12 étapes, étape non vide", async () => {
    const out = output("ai.proposeFeatures");
    const withCriteria = (criteria: unknown[]) =>
      isValid(out, { features: [{ ...FEATURE, criteria }], duplicates: [], meta: META });
    expect(await withCriteria([])).toBe(false);
    expect(await withCriteria(Array(12).fill(CRITERION))).toBe(true);
    expect(await withCriteria(Array(13).fill(CRITERION))).toBe(false);
    expect(await withCriteria([{ title: "t", steps: STEPS.slice(0, 2) }])).toBe(false);
    expect(await withCriteria([{ title: "t", steps: Array(13).fill(STEPS[0]) }])).toBe(false);
    expect(
      await withCriteria([
        { title: "t", steps: [...STEPS.slice(0, 2), { type: "alors", text: "" }] },
      ]),
    ).toBe(false);
  });

  it("chaque feature de la sortie est acceptée par specBatch.submit (parité)", async () => {
    const submit = input("specBatch.submit");
    expect(await isValid(submit, submitWith([FEATURE]))).toBe(true);
    expect(
      await isValid(input("specBatch.submit"), submitWith([{ ...FEATURE, status: "brouillon" }])),
    ).toBe(true);
  });

  it("proposeCriteria : une opération feature.update qui ne porte que criteria", async () => {
    const out = output("ai.proposeCriteria");
    const operation = { kind: "feature.update", specId: "F-001", criteria: [CRITERION] };
    expect(await isValid(out, { operation, meta: META })).toBe(true);
    expect(
      await isValid(out, { operation: { ...operation, kind: "feature.create" }, meta: META }),
    ).toBe(false);
    expect(
      await isValid(out, { operation: { kind: "feature.update", specId: "F-001" }, meta: META }),
    ).toBe(false);
    const value = await parsed(out, {
      operation: { ...operation, title: "Autre", status: "adoptee" },
      meta: META,
    });
    const kept = (value?.operation ?? {}) as Record<string, unknown>;
    expect(kept).not.toHaveProperty("title");
    expect(kept).not.toHaveProperty("status");
    expect(await isValid(input("specBatch.submit"), submitWith([operation]))).toBe(true);
  });

  it("meta : fournisseur du domaine, modèle, usage entier >= 0, aucun coût monétaire", async () => {
    const out = output("ai.draftBrief");
    expect(
      await isValid(out, {
        brief: BRIEF,
        meta: { ...META, usage: { inputTokens: -1, outputTokens: 0 } },
      }),
    ).toBe(false);
    expect(
      await isValid(out, {
        brief: BRIEF,
        meta: { ...META, usage: { inputTokens: 1.5, outputTokens: 0 } },
      }),
    ).toBe(false);
    expect(await isValid(out, { brief: BRIEF, meta: { ...META, provider: "fake" } })).toBe(false);
    const kept = (await parsed(out, { brief: BRIEF, meta: { ...META, costUsd: 0.3 } }))?.meta ?? {};
    expect(kept).not.toHaveProperty("costUsd");
  });

  it("verify : { ok: true, model, checkedAt }, rien d'autre", async () => {
    const out = output("llmCredential.verify");
    expect(await isValid(out, { ok: true, model: "claude-test-1", checkedAt: INSTANT })).toBe(true);
    expect(await isValid(out, { ok: false, model: "claude-test-1", checkedAt: INSTANT })).toBe(
      false,
    );
    expect(await isValid(out, { ok: true, checkedAt: INSTANT })).toBe(false);
    const kept = await parsed(out, {
      ok: true,
      model: "m",
      checkedAt: INSTANT,
      apiKey: "FAKE-KEY-NOT-REAL-1",
      usage: {},
    });
    expect(kept).not.toHaveProperty("apiKey");
    expect(kept).not.toHaveProperty("usage");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("AI4 erreurs typées", () => {
  const AI_ROUTES = ["ai.draftBrief", "ai.proposeFeatures", "ai.proposeCriteria"];

  it.each(AI_ROUTES)("%s : les cinq erreurs LLM, 401, 403, 404, 422 et 503", (name) => {
    const map = errors(name);
    expect(map.LLM_NOT_CONFIGURED?.status).toBe(409);
    expect(map.LLM_RATE_LIMITED?.status).toBe(429);
    expect(map.LLM_PROVIDER_ERROR?.status).toBe(502);
    expect(map.LLM_OUTPUT_INVALID?.status).toBe(502);
    expect(map.PROMPT_REJECTED?.status).toBe(422);
    expect(map.VALIDATION?.status).toBe(422);
    expect(map.ENCRYPTION_UNAVAILABLE?.status).toBe(503);
    expect(map.UNAUTHORIZED?.status).toBe(401);
    expect(map.FORBIDDEN?.status).toBe(403);
    expect(map.NOT_FOUND?.status).toBe(404);
    expect(map.INTERNAL?.status).toBe(500);
  });

  it("verify : pas de sortie invalide ni de prompt rejeté, mais clé absente, débit, fournisseur", () => {
    const map = errors("llmCredential.verify");
    expect(map.LLM_NOT_CONFIGURED?.status).toBe(409);
    expect(map.LLM_RATE_LIMITED?.status).toBe(429);
    expect(map.LLM_PROVIDER_ERROR?.status).toBe(502);
    expect(map.ENCRYPTION_UNAVAILABLE?.status).toBe(503);
    expect(map.NOT_FOUND).toBeUndefined();
    expect(map.LLM_OUTPUT_INVALID).toBeUndefined();
    expect(map.PROMPT_REJECTED).toBeUndefined();
  });

  it("données : raison de configuration, délai en secondes, raison fournisseur, rang du bloc", async () => {
    const map = errors("ai.proposeFeatures");
    for (const reason of ["missing", "invalidated", "undecryptable"]) {
      expect(await isValid(map.LLM_NOT_CONFIGURED?.data, { reason }), reason).toBe(true);
    }
    expect(await isValid(map.LLM_NOT_CONFIGURED?.data, { reason: "no-encryption-key" })).toBe(
      false,
    );
    expect(await isValid(map.LLM_RATE_LIMITED?.data, { retryAfterSeconds: 30 })).toBe(true);
    expect(await isValid(map.LLM_RATE_LIMITED?.data, { retryAfterSeconds: 0 })).toBe(false);
    expect(await isValid(map.LLM_RATE_LIMITED?.data, {})).toBe(false);
    for (const reason of [
      "auth",
      "quota",
      "timeout",
      "aborted",
      "budget",
      "context_too_long",
      "refused",
      "model_not_found",
      "unavailable",
    ]) {
      expect(await isValid(map.LLM_PROVIDER_ERROR?.data, { reason }), reason).toBe(true);
    }
    expect(await isValid(map.LLM_PROVIDER_ERROR?.data, { reason: "autre" })).toBe(false);
    expect(await isValid(map.PROMPT_REJECTED?.data, { rank: 1 })).toBe(true);
    expect(await isValid(map.PROMPT_REJECTED?.data, { rank: 0 })).toBe(false);
  });

  it("les erreurs ne portent ni message du fournisseur, ni prompt, ni sortie, ni clé (data fermée)", async () => {
    const map = errors("ai.draftBrief");
    for (const code of [
      "PROMPT_REJECTED",
      "LLM_PROVIDER_ERROR",
      "LLM_NOT_CONFIGURED",
      "LLM_RATE_LIMITED",
    ]) {
      const value = await parsed(map[code]?.data, {
        reason: "auth",
        rank: 1,
        retryAfterSeconds: 5,
        message: "texte du fournisseur",
        content: "le brief",
        apiKey: "FAKE-KEY-NOT-REAL-1",
      });
      for (const key of ["message", "content", "apiKey"]) {
        expect(value ?? {}, `${code}.${key}`).not.toHaveProperty(key);
      }
    }
  });

  it("l'OpenAPI publie 409, 422, 429 et 502 sur les propositions", async () => {
    const d = await doc();
    const codes = Object.keys(d.paths["/projects/{projectId}/ai/features"]?.post?.responses ?? {});
    expect(codes).toEqual(
      expect.arrayContaining(["401", "403", "404", "409", "422", "429", "500", "502", "503"]),
    );
  });
});

describe("AI5 aucun secret dans les schémas du groupe ai", () => {
  it("aucune propriété apiKey, token, secret, nonce ni prompt dans les chemins ai et verify", async () => {
    const d = await doc();
    const text = JSON.stringify([
      d.paths["/projects/{projectId}/ai/brief"],
      d.paths["/projects/{projectId}/ai/features"],
      d.paths["/projects/{projectId}/ai/criteria"],
      d.paths["/llm-credentials/{provider}/verify"],
    ]);
    expect(text).toContain("feature.create");
    for (const name of ["apiKey", "token", "secret", "nonce", "prompt", "system", "ciphertext"]) {
      expect(text, name).not.toContain(`"${name}"`);
    }
  });
});
