import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertLlmRequest,
  framePrompt,
  InvalidLlmRequestError,
  LLM_INVALID_OUTPUT_REASONS,
  LLM_MAX_RETRY_AFTER_MS,
  LlmAuthError,
  LlmBudgetExceededError,
  LlmInvalidOutputError,
  LlmProviderError,
  LlmRateLimitedError,
  trusted,
  Untrusted,
  unvalidated,
  validateLlmOutput,
} from "../src/index.ts";
import { BUDGET, makeRequest, NONCE } from "./llm-helpers.ts";

const readdirSyncSafe = (dir: string): Dirent[] => {
  try {
    return readdirSync(dir, { withFileTypes: true, recursive: true });
  } catch {
    return [];
  }
};

const reasonOf = (request: Parameters<typeof assertLlmRequest>[0]): string => {
  try {
    assertLlmRequest(request);
    return "ok";
  } catch (error) {
    return error instanceof InvalidLlmRequestError ? error.reason : String(error);
  }
};

describe("TK-50c : la garde retourne un instantané gelé (TOCTOU)", () => {
  it("retourne une requête gelée en profondeur : budget, trace, sortie JSON et schéma", () => {
    const snapshot = assertLlmRequest(
      makeRequest({ output: { kind: "json", schema: { type: "object", props: { a: { b: 1 } } } } }),
    );
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.budget)).toBe(true);
    expect(Object.isFrozen(snapshot.trace)).toBe(true);
    expect(Object.isFrozen(snapshot.output)).toBe(true);
    const schema = (snapshot.output as unknown as { schema: { props: { a: object } } }).schema;
    expect(Object.isFrozen(schema)).toBe(true);
    expect(Object.isFrozen(schema.props.a)).toBe(true);
  });

  it("copie le budget : modifier l'original après la garde ne change pas l'instantané", () => {
    const request = makeRequest({ budget: { ...BUDGET } });
    const snapshot = assertLlmRequest(request);
    expect(snapshot.budget).not.toBe(request.budget);
    (request.budget as { maxOutputTokens: number }).maxOutputTokens = 10 ** 9;
    expect(snapshot.budget.maxOutputTokens).toBe(BUDGET.maxOutputTokens);
  });

  it("garde le prompt, la clé et le signal (déjà opaques) et le modèle lus une seule fois", () => {
    let reads = 0;
    const controller = new AbortController();
    const request = makeRequest({ signal: controller.signal });
    Object.defineProperty(request, "model", {
      get: () => {
        reads += 1;
        return reads === 1 ? "claude-test-1" : "autre";
      },
    });
    const snapshot = assertLlmRequest(request);
    expect(snapshot.model).toBe("claude-test-1");
    expect(reads).toBe(1);
    expect(snapshot.prompt).toBe(request.prompt);
    expect(snapshot.credential).toBe(request.credential);
    expect(snapshot.signal).toBe(controller.signal);
  });

  it("un budget relu à chaud et devenu invalide ne passe pas la garde sur une seconde lecture", () => {
    let reads = 0;
    const request = makeRequest();
    Object.defineProperty(request, "budget", {
      get: () => {
        reads += 1;
        return reads === 1 ? BUDGET : { ...BUDGET, maxOutputTokens: 10 ** 9 };
      },
    });
    const snapshot = assertLlmRequest(request);
    expect(reads).toBe(1);
    expect(snapshot.budget).toEqual(BUDGET);
    expect(() =>
      assertLlmRequest(makeRequest({ budget: { ...BUDGET, maxOutputTokens: 10 ** 9 } })),
    ).toThrow(LlmBudgetExceededError);
  });
});

describe("TK-50c : durcissement des erreurs", () => {
  it("LlmInvalidOutputError.reason appartient à une liste fermée", () => {
    expect(LLM_INVALID_OUTPUT_REASONS).toEqual(["shape", "not-synchronous"]);
    const shape = (() => {
      try {
        validateLlmOutput(unvalidated("x"), () => {
          throw new Error("secret");
        });
      } catch (error) {
        return error as LlmInvalidOutputError;
      }
      return undefined;
    })();
    expect(shape?.reason).toBe("shape");
    const sync = (() => {
      try {
        validateLlmOutput(unvalidated("x"), () => Promise.resolve(1));
      } catch (error) {
        return error as LlmInvalidOutputError;
      }
      return undefined;
    })();
    expect(sync?.reason).toBe("not-synchronous");
  });

  it("une raison libre passée au constructeur est ramenée à « shape »", () => {
    const error = new LlmInvalidOutputError("clé sk-SECRET dans la raison" as never);
    expect(error.reason).toBe("shape");
    expect(JSON.stringify(error)).not.toContain("SECRET");
  });

  it("plafonne retryAfterMs", () => {
    const capped = new LlmRateLimitedError({ operation: "complete", retryAfterMs: 10 ** 12 });
    expect(capped.retryAfterMs).toBe(LLM_MAX_RETRY_AFTER_MS);
    expect(
      new LlmRateLimitedError({ operation: "complete", retryAfterMs: 1500.9 }).retryAfterMs,
    ).toBe(1500);
    expect(
      new LlmRateLimitedError({ operation: "complete", retryAfterMs: Number.NaN }).retryAfterMs,
    ).toBe(0);
  });

  it("tolère un diagnostic null ou absent, racine et sous-classes", () => {
    for (const bad of [null, undefined] as const) {
      expect(new LlmProviderError(bad as never).operation).toBe("unknown");
      const auth = new LlmAuthError(bad as never);
      expect(auth.operation).toBe("unknown");
      expect(auth.provider).toBeUndefined();
    }
  });
});

describe("TK-50c : durcissement de la requête", () => {
  it("n'accepte qu'un vrai AbortSignal : un objet { aborted } est refusé", () => {
    expect(reasonOf(makeRequest({ signal: { aborted: false } as never }))).toBe("signal");
    expect(reasonOf(makeRequest({ signal: { aborted: true } as never }))).toBe("signal");
    expect(reasonOf(makeRequest({ signal: new AbortController().signal }))).toBe("ok");
  });

  it.each(["a/b", "../x", "claude..x", "x..", "/abs", "a//b"])("refuse le modèle %s", (model) => {
    expect(reasonOf(makeRequest({ model }))).toBe("model");
  });

  it.each(["claude-sonnet-4.5", "gpt-4o:2024", "x".repeat(128)])(
    "accepte le modèle %s",
    (model) => {
      expect(reasonOf(makeRequest({ model }))).toBe("ok");
    },
  );
});

describe("TK-50c : surrogates isolés neutralisés (toWellFormed)", () => {
  const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

  it("remplace un surrogate isolé d'une donnée par U+FFFD", () => {
    const prompt = framePrompt({
      instructions: trusted`Résume.`,
      data: [new Untrusted("brief", "avant \uD800 milieu \uDC00 après 😀")],
      nonce: NONCE,
    });
    expect(LONE.test(prompt.user)).toBe(false);
    expect(prompt.user).toContain("avant � milieu � après 😀");
  });
});

describe("TK-50c : revealUntrusted reste interne au cadrage", () => {
  const roots = ["packages", "apps"].map((dir) =>
    resolve(import.meta.dirname, "..", "..", "..", dir),
  );
  const allowed = new Set(["untrusted.ts", "llm-prompt.ts"]);

  const sources = (dir: string): string[] =>
    readdirSyncSafe(dir)
      .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
      .map((e) => resolve(e.parentPath, e.name))
      .filter((file) => file.includes("/src/") && !/\/(node_modules|dist|coverage)\//.test(file));

  it("n'est référencé en source de production que par untrusted.ts et llm-prompt.ts", () => {
    const offenders = roots
      .flatMap(sources)
      .filter((file) => /\brevealUntrusted\b/.test(readFileSync(file, "utf8")))
      .filter((file) => !allowed.has(file.split("/").at(-1) as string));
    expect(offenders).toEqual([]);
  });
});

describe("TK-50c : ADR 0011 documente les limites restantes", () => {
  const adr = readFileSync(
    resolve(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "docs",
      "adr",
      "0011-llm-port-and-untrusted-data.md",
    ),
    "utf8",
  );

  it("décrit la forge de `trusted` par tableau gelé comme limite assumée", () => {
    expect(adr).toMatch(/forge/i);
    expect(adr).toMatch(/tableau gelé/i);
  });

  it("décrit l'instantané gelé de la garde (TOCTOU) et le faux exporté par @koklo/domain/testing", () => {
    expect(adr).toMatch(/TOCTOU/);
    expect(adr).toMatch(/instantané/i);
    expect(adr).toContain("@koklo/domain/testing");
  });
});
