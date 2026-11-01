import { describe, expect, it } from "vitest";
import * as domain from "../src/index.ts";
import {
  LLM_BUDGET_LIMITS,
  LLM_PROVIDER_ERROR_NAMES,
  LlmAbortedError,
  LlmAuthError,
  LlmBudgetExceededError,
  LlmContextTooLongError,
  LlmInvalidOutputError,
  LlmModelNotFoundError,
  LlmProviderError,
  type LlmProviderErrorName,
  LlmProviderUnavailableError,
  LlmQuotaExceededError,
  LlmRateLimitedError,
  LlmRefusedError,
  LlmTimeoutError,
} from "../src/index.ts";
import { PROMPT_TEXT, SECRET_KEY } from "./llm-helpers.ts";

/**
 * TK-50b : 11 erreurs typées sous la racine `LlmProviderError { operation, provider?, status? }`.
 * Aucune ne porte clé, prompt, sortie ni `cause`. Le constructeur ne reprend que des champs connus
 * et valides (opération `/^[a-z][a-z0-9-]{0,39}$/`, fournisseur de la liste fermée, statut HTTP
 * entier 100..599), les autres sont ignorés (absents, pas `undefined`).
 */
const D = { operation: "complete", provider: "anthropic", status: 401 } as const;
const BUILDERS: Record<LlmProviderErrorName, () => LlmProviderError> = {
  LlmAuthError: () => new LlmAuthError(D),
  LlmRateLimitedError: () => new LlmRateLimitedError({ ...D, status: 429, retryAfterMs: 1500 }),
  LlmQuotaExceededError: () => new LlmQuotaExceededError({ ...D, status: 402 }),
  LlmTimeoutError: () => new LlmTimeoutError(D),
  LlmAbortedError: () => new LlmAbortedError(D),
  LlmBudgetExceededError: () => new LlmBudgetExceededError({ ...D, limit: "cost" }),
  LlmContextTooLongError: () => new LlmContextTooLongError(D),
  LlmRefusedError: () => new LlmRefusedError(D),
  LlmModelNotFoundError: () => new LlmModelNotFoundError(D),
  LlmProviderUnavailableError: () => new LlmProviderUnavailableError({ ...D, status: 503 }),
  // Le skeleton 50b n'a pas encore rerooté LlmInvalidOutputError : le cast disparaît au Green.
  LlmInvalidOutputError: () =>
    new LlmInvalidOutputError("forme inattendue") as unknown as LlmProviderError,
};

/** Exhaustivité : ajouter un nom à la liste fermée casse la compilation ici. */
const describeKind = (name: LlmProviderErrorName): string => {
  switch (name) {
    case "LlmAuthError":
    case "LlmRateLimitedError":
    case "LlmQuotaExceededError":
    case "LlmTimeoutError":
    case "LlmAbortedError":
    case "LlmBudgetExceededError":
    case "LlmContextTooLongError":
    case "LlmRefusedError":
    case "LlmModelNotFoundError":
    case "LlmProviderUnavailableError":
    case "LlmInvalidOutputError":
      return name;
    default: {
      const never: never = name;
      return never;
    }
  }
};

describe("erreurs du port LLM : forme", () => {
  it("liste fermée des 11 noms", () => {
    expect([...LLM_PROVIDER_ERROR_NAMES]).toEqual([
      "LlmAuthError",
      "LlmRateLimitedError",
      "LlmQuotaExceededError",
      "LlmTimeoutError",
      "LlmAbortedError",
      "LlmBudgetExceededError",
      "LlmContextTooLongError",
      "LlmRefusedError",
      "LlmModelNotFoundError",
      "LlmProviderUnavailableError",
      "LlmInvalidOutputError",
    ]);
    expect(LLM_PROVIDER_ERROR_NAMES.map(describeKind)).toHaveLength(11);
  });

  it.each(LLM_PROVIDER_ERROR_NAMES)("%s : name, héritage de la racine, classe exportée", (name) => {
    const error = BUILDERS[name]();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(LlmProviderError);
    expect(error).toBeInstanceOf((domain as unknown as Record<string, new () => Error>)[name]);
    expect(error.name).toBe(name);
    expect(error.message.length).toBeGreaterThan(10);
    expect(error.message).toContain(" ");
  });

  it("la racine porte operation, provider et status", () => {
    const e = new LlmAuthError(D);
    expect(e.operation).toBe("complete");
    expect(e.provider).toBe("anthropic");
    expect(e.status).toBe(401);
    expect(new LlmProviderError({ operation: "complete" }).name).toBe("LlmProviderError");
  });

  it("LlmRateLimitedError porte retryAfterMs (entier >= 0)", () => {
    expect((BUILDERS.LlmRateLimitedError() as LlmRateLimitedError).retryAfterMs).toBe(1500);
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY, undefined, "12"]) {
      const e = new LlmRateLimitedError({ ...D, retryAfterMs: bad as number });
      expect(e.retryAfterMs).toBe(0);
    }
    expect(new LlmRateLimitedError({ ...D, retryAfterMs: 12.9 }).retryAfterMs).toBe(12);
  });

  it("LlmBudgetExceededError porte la limite fermée", () => {
    expect([...LLM_BUDGET_LIMITS]).toEqual(["output-tokens", "timeout", "cost", "prompt-chars"]);
    expect(BUDGET_ERR().limit).toBe("cost");
  });

  it("LlmInvalidOutputError est rerootée sous la racine et garde son contrat de 50a", () => {
    const e = new LlmInvalidOutputError("forme inattendue") as unknown as LlmProviderError &
      LlmInvalidOutputError;
    expect(e).toBeInstanceOf(LlmProviderError);
    expect(e.reason).toBe("forme inattendue");
    expect(e.operation).toBe("validate");
    expect(e.provider).toBeUndefined();
  });
});

const BUDGET_ERR = () => BUILDERS.LlmBudgetExceededError() as LlmBudgetExceededError;

describe("erreurs du port LLM : diagnostic assaini", () => {
  it("omet (n'écrit pas undefined) provider et status absents", () => {
    const e = new LlmTimeoutError({ operation: "complete" });
    expect("provider" in e).toBe(false);
    expect("status" in e).toBe(false);
  });

  it("ignore un statut hors 100..599 ou non entier", () => {
    for (const status of [0, 99, 600, 401.5, Number.NaN, -1, "401" as unknown as number]) {
      expect("status" in new LlmAuthError({ ...D, status })).toBe(false);
    }
    expect(new LlmAuthError({ ...D, status: 100 }).status).toBe(100);
    expect(new LlmAuthError({ ...D, status: 599 }).status).toBe(599);
  });

  it("ignore un fournisseur hors liste fermée et accepte fake", () => {
    expect("provider" in new LlmAuthError({ ...D, provider: "evil" as never })).toBe(false);
    expect(new LlmAuthError({ ...D, provider: "fake" }).provider).toBe("fake");
    for (const provider of ["anthropic", "openai", "google"] as const) {
      expect(new LlmAuthError({ ...D, provider }).provider).toBe(provider);
    }
  });

  it("remplace une opération qui ressemble à du contenu par « unknown »", () => {
    for (const operation of [PROMPT_TEXT, SECRET_KEY, "", "A".repeat(5), "x".repeat(41), "a\nb"]) {
      expect(new LlmAuthError({ ...D, operation }).operation).toBe("unknown");
    }
    expect(new LlmAuthError({ ...D, operation: "complete" }).operation).toBe("complete");
    expect(new LlmAuthError({ ...D, operation: "x".repeat(40) }).operation).toBe("x".repeat(40));
  });
});

describe("erreurs du port LLM : non-fuite", () => {
  const HOSTILE = {
    apiKey: SECRET_KEY,
    prompt: PROMPT_TEXT,
    output: "SORTIE-SENTINELLE",
    cause: new Error(SECRET_KEY),
    headers: { authorization: `Bearer ${SECRET_KEY}` },
  };

  it.each(LLM_PROVIDER_ERROR_NAMES)(
    "%s : ni clé, ni prompt, ni cause, même avec des champs hostiles",
    (name) => {
      const build: () => LlmProviderError =
        name === "LlmInvalidOutputError"
          ? () => new LlmInvalidOutputError("forme inattendue") as unknown as LlmProviderError
          : () => {
              const ctor = (
                domain as unknown as Record<string, new (i: object) => LlmProviderError>
              )[name] as new (
                i: object,
              ) => LlmProviderError;
              return new ctor({ ...D, retryAfterMs: 1, limit: "cost", ...HOSTILE });
            };
      const error = build();
      const dump = [
        error.message,
        error.stack ?? "",
        JSON.stringify(error),
        JSON.stringify(Object.getOwnPropertyNames(error)),
        String(error),
      ].join("\n");
      expect(dump).not.toContain("SENTINELLE");
      expect("cause" in error).toBe(false);
      expect(error.cause).toBeUndefined();
      const allowed = new Set([
        "stack",
        "message",
        "name",
        "operation",
        "provider",
        "status",
        "retryAfterMs",
        "limit",
        "reason",
      ]);
      for (const key of Object.getOwnPropertyNames(error)) {
        expect(allowed.has(key), `propriété inattendue « ${key} » sur ${name}`).toBe(true);
      }
    },
  );
});
