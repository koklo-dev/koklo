import { describe, expect, it } from "vitest";
import {
  classifyAgentFailure,
  detectQuota,
  InvalidQuotaError,
  onQuotaHit,
  parseQuotaState,
  QUOTA_MAX_BACKOFF_MS,
  type QuotaSignal,
  serializeQuotaState,
  startQuotaState,
} from "../src/index.ts";
import { BACKOFF, HOUR, NOW, signal, stateAt } from "./quota-helpers.ts";

/** Revue d'attaque TK-74 : R1 faux quotas collants, R2 faux négatifs, R3 plafond de recul. */
const DAY = 24 * HOUR;

/** Jamais un signal fort : soit rien, soit un signal faible (backoff simple, sans escalade). */
const harmless = (text: string): void => {
  const found = detectQuota(text);
  expect(found === null || found.strength === "weak", JSON.stringify(text)).toBe(true);
};

describe("R1 : un texte cité ou ordinaire ne fait pas escalader vers exhausted", () => {
  it.each([
    "please fix the rate_limit_error handling in code",
    "The agent handles `credit balance is too low` errors",
    "limit resets in 5 minutes (user-defined cron)",
    '  expect(x).toBe("weekly limit reached")',
    "> weekly limit reached",
    "\u001b[31mWeekly limit reached",
    "\u001b[31m-  expect(x).toBe('Weekly limit reached')",
    "  // 5-hour limit reached ∙ resets 3pm",
    "# Weekly limit reached ∙ resets Mon 9am",
    " * Weekly limit reached ∙ resets Mon 9am",
    "assert.equal(message, 'Credit balance is too low')",
    "expect(out).toContain('Credit balance is too low')",
    "expect(out).toEqual('Weekly limit reached')",
    'const message = "Weekly limit reached"',
    "message = 'Credit balance is too low'",
    '"Credit balance is too low"',
    "```\nWeekly limit reached\n```",
    "```ts\nCredit balance is too low\nWeekly limit reached ∙ resets Mon 9am\n```\nfini",
    "@@ -1 +1 @@\n- Weekly limit reached ∙ resets Mon 9am\n+ ok",
    "the user said weekly limit reached yesterday",
    "log: credit balance is too low (handled)",
    "error: exceeded line limit in lint rule",
  ])("%j", harmless);

  it("les citations de test et de diff restent ignorées, même nettoyées", () => {
    for (const text of [
      "\u001b[32m+  throw new Error('usage limit reached')",
      "​> Weekly limit reached",
    ]) {
      expect(detectQuota(text), text).toBeNull();
    }
  });

  it("une sortie ordinaire contenant limit n'est pas un quota", () => {
    expect(classifyAgentFailure("error: exceeded line limit in lint rule")).toEqual({
      kind: "other",
    });
  });

  it("un bloc de code non fermé ne masque pas un vrai quota", () => {
    expect(detectQuota("```\nsortie\nWeekly limit reached ∙ resets Mon 9am")?.strength).toBe(
      "strong",
    );
  });
});

describe("signaux forts et faibles", () => {
  it.each([
    ["Claude AI usage limit reached|1760000000", "strong"],
    ["5-hour limit reached ∙ resets 3pm", "strong"],
    ["Weekly limit reached ∙ resets Mon 9am", "strong"],
    ["- Weekly limit reached ∙ resets Mon 9am", "strong"],
    ["API Error: 429 rate_limit_error retry-after: 30", "strong"],
    ['{"type":"error","error":{"type":"rate_limit_error","message":"x"}}', "strong"],
    ["API Error: rate_limit_error", "strong"],
    ["Credit balance is too low", "strong"],
    ["Error: Your credit balance is too low to access the API", "strong"],
    ["You're out of extra usage · resets 3pm", "strong"],
    ["request failed with rate_limit_error", "weak"],
    ["Monthly limit reached ∙ resets Dec 1", "weak"],
    ["\u001b[31mWeekly limit reached", "weak"],
  ])("%j -> %s", (text, strength) => {
    expect(detectQuota(text)?.strength).toBe(strength);
  });
});

describe("R2 : le filet de sécurité ne laisse jamais passer un quota en échec", () => {
  const NET = [
    "Usage limit reached",
    "Claude usage limit reached",
    "Rate limit exceeded",
    "API Error: Rate limit reached",
    "You're out of extra usage · resets 3pm",
    "You're out of extra usage",
    "Request rejected (429)",
    "You have exceeded your usage limit",
    "HTTP 429 rate limit hit",
    "5‑hour limit reached ∙ resets 3pm",
    "Weekly limit reached ∙ resets Mon 9am",
    "- Weekly limit reached ∙ resets Mon 9am",
    "• Weekly limit reached ∙ resets Mon 9am",
  ];
  it.each(NET)("%j est un quota", (text) => {
    for (const output of [text, `${text}\n`, `Error context\n${text}`]) {
      expect(detectQuota(output), output).not.toBeNull();
      expect(classifyAgentFailure(output).kind).toBe("quota");
    }
  });

  it("n'accepte toujours pas « usage limit » ni « 429 » nus", () => {
    for (const text of [
      "usage limit",
      "HTTP 429",
      "error at src/app.ts:429",
      "processed 4290 items",
    ]) {
      expect(detectQuota(text), text).toBeNull();
    }
  });
});

describe("l'escalade vers exhausted ne vient que des signaux forts", () => {
  const weak = (id: string): QuotaSignal => signal({ id, strength: "weak", kind: "unknown_limit" });
  const run = (hits: readonly QuotaSignal[]) =>
    hits.reduce(
      (state, hit, i) => onQuotaHit(state, hit, NOW + i * 2 * DAY, 0, BACKOFF),
      startQuotaState(),
    );

  it("20 signaux faibles espacés restent en backoff, sans compter", () => {
    const state = run(Array.from({ length: 20 }, (_, i) => weak(`w${i}`)));
    expect(state.status).toBe("backoff");
    expect(state.consecutiveHits).toBe(0);
    expect(state.resumeAt).toBe(NOW + 19 * 2 * DAY + BACKOFF.baseMs);
  });

  it("un signal faible ne fait pas progresser un compteur déjà entamé", () => {
    const strong = onQuotaHit(startQuotaState(), signal({ id: "s" }), NOW, 0, BACKOFF);
    const after = onQuotaHit(strong, weak("w"), NOW + 2 * DAY, 0, BACKOFF);
    expect(after.consecutiveHits).toBe(strong.consecutiveHits);
    expect(after.status).toBe("backoff");
  });

  it("un signal faible de nature exhausted forgée n'épuise pas", () => {
    const forged = signal({ id: "f", strength: "weak", kind: "exhausted" });
    expect(onQuotaHit(startQuotaState(), forged, NOW, 0, BACKOFF).status).toBe("backoff");
  });

  it("cinq signaux forts espacés épuisent toujours", () => {
    const hits = Array.from({ length: 5 }, (_, i) => signal({ id: `s${i}`, strength: "strong" }));
    expect(run(hits).status).toBe("exhausted");
  });

  it("assertSignal refuse une force inconnue", () => {
    expect(() =>
      onQuotaHit(
        startQuotaState(),
        signal({ id: "x", strength: "huge" as never }),
        NOW,
        0,
        BACKOFF,
      ),
    ).toThrow(InvalidQuotaError);
  });
});

describe("R3 : plafond de recul dur de 24 h", () => {
  const at = (over: Partial<QuotaSignal>, policy = BACKOFF, jitter = 0.999) =>
    onQuotaHit(startQuotaState(), signal({ id: "a", ...over }), NOW, jitter, policy);
  const delay = (state: { resumeAt: number | null }) => (state.resumeAt as number) - NOW;

  it("la gigue ne dépasse jamais maxDelayMs", () => {
    const policy = { ...BACKOFF, maxDelayMs: HOUR, jitterRatio: 0.5 };
    expect(delay(at({ retryAfterMs: 5e9 }, policy))).toBe(HOUR);
    expect(delay(at({ retryAfterMs: 5e9 }, policy, 0))).toBe(HOUR);
    expect(delay(at({}, { ...policy, baseMs: HOUR }))).toBe(HOUR);
  });

  it("jitterRatio hors de [0,1] est refusé", () => {
    for (const jitterRatio of [1e9, 1.01, -0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => at({}, { ...BACKOFF, jitterRatio })).toThrow(InvalidQuotaError);
    }
    expect(delay(at({}, { ...BACKOFF, jitterRatio: 1 }))).toBeLessThanOrEqual(BACKOFF.maxDelayMs);
  });

  it("maxDelayMs est plafonné à 24 h", () => {
    expect(QUOTA_MAX_BACKOFF_MS).toBe(DAY);
    for (const maxDelayMs of [DAY + 1, 5e9, Number.MAX_SAFE_INTEGER]) {
      expect(() => at({}, { ...BACKOFF, maxDelayMs })).toThrow(InvalidQuotaError);
    }
    expect(delay(at({ retryAfterMs: DAY * 9 }, { ...BACKOFF, maxDelayMs: DAY }, 0))).toBe(DAY);
  });

  it.each([1e15, Number.MAX_SAFE_INTEGER, 5e9])(
    "retry-after géant %j reste borné",
    (retryAfterMs) => {
      expect(delay(at({ retryAfterMs }))).toBeLessThanOrEqual(BACKOFF.maxDelayMs);
    },
  );

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    "retry-after %j refusé",
    (retryAfterMs) => {
      expect(() => at({ retryAfterMs })).toThrow(InvalidQuotaError);
    },
  );

  it("un retry-after détecté est plafonné à 24 h", () => {
    const found = detectQuota("API Error: 429 rate_limit_error retry-after: 999999999");
    expect(found?.retryAfterMs).toBe(DAY);
  });
});

describe("R3 : état reçu en mémoire et état persisté", () => {
  it.each([
    ["consecutiveHits négatif", { consecutiveHits: -5 }],
    ["consecutiveHits NaN", { consecutiveHits: Number.NaN }],
    ["consecutiveHits fractionnaire", { consecutiveHits: 1.5 }],
    ["version négative", { version: -1 }],
    ["version NaN", { version: Number.NaN }],
    ["resumeAt infini", { status: "backoff", resumeAt: Number.POSITIVE_INFINITY }],
    ["resumeAt NaN", { status: "backoff", resumeAt: Number.NaN }],
    ["statut inconnu", { status: "zombie" }],
  ] as const)("état forgé en mémoire : %s", (_name, over) => {
    const forged = stateAt(over as never);
    expect(() => onQuotaHit(forged, signal({ id: "z" }), NOW, 0, BACKOFF)).toThrow(
      InvalidQuotaError,
    );
  });

  it("parseQuotaState écrête un resumeAt persisté au-delà de now + 24 h", () => {
    const text = serializeQuotaState(
      stateAt({ status: "backoff", resumeAt: NOW + 400 * DAY, consecutiveHits: 1, version: 1 }),
    );
    expect(parseQuotaState(text).resumeAt).toBe(NOW + 400 * DAY);
    expect(parseQuotaState(text, NOW).resumeAt).toBe(NOW + DAY);
    const near = serializeQuotaState(
      stateAt({ status: "backoff", resumeAt: NOW + HOUR, consecutiveHits: 1, version: 1 }),
    );
    expect(parseQuotaState(near, NOW).resumeAt).toBe(NOW + HOUR);
    expect(() => parseQuotaState(near, -1)).toThrow(InvalidQuotaError);
  });
});
