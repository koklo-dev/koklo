import { describe, expect, it } from "vitest";
import {
  classifyAgentFailure,
  detectQuota,
  InvalidQuotaError,
  QUOTA_KINDS,
  QUOTA_PATTERNS,
  QUOTA_RAW_MAX_CHARS,
  QUOTA_SCAN_CHARS,
  type QuotaKind,
  type QuotaSignal,
} from "../src/index.ts";

interface Phrase {
  readonly name: string;
  readonly text: string;
  readonly kind: QuotaKind;
  readonly expected: Partial<QuotaSignal>;
}

/** Une entrée de la table de motifs = une formulation du fournisseur = un test (vision §10.7). */
const PHRASES: readonly Phrase[] = [
  {
    name: "claude-usage-limit-reached-epoch",
    text: "Claude AI usage limit reached|1760000000",
    kind: "rate_window",
    expected: { resetAt: 1_760_000_000_000 },
  },
  {
    name: "five-hour-limit-resets-clock",
    text: "5-hour limit reached ∙ resets 3pm",
    kind: "rate_window",
    expected: { resetHint: { hour: 15, minute: 0, zone: null } },
  },
  {
    name: "weekly-limit-reached",
    text: "Weekly limit reached ∙ resets Mon 9am",
    kind: "rate_window",
    expected: { resetHint: null, resetAt: null },
  },
  {
    name: "opus-limit-reached",
    text: "Opus limit reached ∙ resets 9:30am",
    kind: "rate_window",
    expected: { resetHint: { hour: 9, minute: 30, zone: null } },
  },
  {
    name: "your-limit-will-reset-at",
    text: "Claude usage limit reached. Your limit will reset at 3pm (Europe/Paris)",
    kind: "rate_window",
    expected: { resetHint: { hour: 15, minute: 0, zone: "Europe/Paris" } },
  },
  {
    name: "hit-your-limit-resets",
    text: "You've hit your limit · resets 11pm (Europe/Paris)",
    kind: "rate_window",
    expected: { resetHint: { hour: 23, minute: 0, zone: "Europe/Paris" } },
  },
  {
    name: "api-429-rate-limit-error",
    text: '{"type":"error","error":{"type":"rate_limit_error","message":"This request would exceed your rate limit."}}',
    kind: "rate_window",
    expected: { retryAfterMs: null },
  },
  {
    name: "api-429-retry-after",
    text: "API Error: 429 rate_limit_error retry-after: 30",
    kind: "rate_window",
    expected: { retryAfterMs: 30_000 },
  },
  {
    name: "api-429-too-many-requests",
    text: "API Error: 429 Too Many Requests",
    kind: "rate_window",
    expected: {},
  },
  {
    name: "credit-balance-too-low",
    text: "Credit balance is too low",
    kind: "exhausted",
    expected: { resetAt: null },
  },
  {
    name: "unknown-limit-heuristic",
    text: "Monthly limit reached ∙ resets Dec 1",
    kind: "unknown_limit",
    expected: {},
  },
];

const FORBIDDEN = /[\u2066-\u2069\u202a-\u202e\u200e\u200f]/;
const hasForbiddenChars = (text: string): boolean =>
  FORBIDDEN.test(text) ||
  [...text].some((ch) => {
    const code = ch.charCodeAt(0);
    return (code < 32 && code !== 10 && code !== 9) || code === 127;
  });

const asStderr = (text: string) => `${text}\n`;
const asResult = (text: string) =>
  JSON.stringify({ type: "result", subtype: "success", is_error: true, result: text });

describe("table de motifs : donnée, pas code", () => {
  it("expose une entrée nommée par formulation, sans doublon, sans drapeau global", () => {
    const names = QUOTA_PATTERNS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.sort()).toEqual(PHRASES.map((p) => p.name).sort());
    for (const pattern of QUOTA_PATTERNS) {
      expect(QUOTA_KINDS).toContain(pattern.kind);
      expect(pattern.regex.flags).not.toMatch(/[gy]/);
    }
  });
});

describe("incident-22 : une formulation réelle par test", () => {
  for (const phrase of PHRASES) {
    it(`incident-22-${phrase.name} (stderr)`, () => {
      const found = detectQuota(asStderr(phrase.text));
      expect(found).not.toBeNull();
      expect(found?.kind).toBe(phrase.kind);
      expect(found?.pattern).toBe(phrase.name);
      expect(found).toMatchObject(phrase.expected);
    });

    it(`incident-22-${phrase.name} (message result)`, () => {
      const found = detectQuota(asResult(phrase.text));
      expect(found?.pattern).toBe(phrase.name);
      expect(found?.kind).toBe(phrase.kind);
    });
  }

  it("insensible à la casse, aux espaces et à la typographie du séparateur", () => {
    for (const text of [
      "5-HOUR LIMIT REACHED  ·  RESETS 3PM",
      "5-hour limit reached | resets 3pm",
      "5-hour limit reached • resets 3pm",
      "5–hour limit reached - resets 3 PM",
    ]) {
      expect(detectQuota(text)?.pattern, text).toBe("five-hour-limit-resets-clock");
    }
  });

  it("12am vaut minuit et 12pm midi", () => {
    expect(detectQuota("5-hour limit reached ∙ resets 12am")?.resetHint).toMatchObject({ hour: 0 });
    expect(detectQuota("5-hour limit reached ∙ resets 12pm")?.resetHint).toMatchObject({
      hour: 12,
    });
  });

  it("D4 : la surcharge n'est PAS un quota", () => {
    for (const text of [
      '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
      "API Error: 529 overloaded_error",
      "HTTP 529",
    ]) {
      expect(detectQuota(text), text).toBeNull();
    }
  });

  it("le signal est gelé, borné et assaini", () => {
    const found = detectQuota("5-hour limit reached ∙ resets 3pm") as QuotaSignal;
    expect(Object.isFrozen(found)).toBe(true);
    expect(found.raw.length).toBeLessThanOrEqual(QUOTA_RAW_MAX_CHARS);
    expect(found.id).toBeUndefined();
  });

  it("est déterministe", () => {
    const text = "Claude AI usage limit reached|1760000000";
    expect(detectQuota(text)).toEqual(detectQuota(text));
  });
});

describe("faux positifs : un « limit » ordinaire n'est pas un quota", () => {
  it.each([
    "",
    "   \n  ",
    "TypeError: boom",
    "error: exceeded line limit in lint rule",
    "the file size limit of the test is 5",
    "I set the rate limit to 100 requests per minute in the config",
    "added QuotaExceededError to the domain (quota par token, vision §616)",
    "packages/quota-limits/src/index.ts",
    "reset the limit in config",
    "error at src/app.ts:429",
    "processed 4290 items",
    "+  throw new Error('usage limit reached');",
    "-  // 5-hour limit reached ∙ resets 3pm",
    "@@ -1,3 +1,4 @@\n+it('rate_limit_error is mapped', () => {})",
    "  it('429 Too Many Requests is retried', () => {",
  ])("%j -> null", (text) => {
    expect(detectQuota(text)).toBeNull();
  });

  it("une réponse longue et normale qui cite la phrase en son début n'est pas un quota", () => {
    const answer = `Claude AI usage limit reached|1760000000\n${"Tout va bien. ".repeat(600)}`;
    expect(answer.length).toBeGreaterThan(QUOTA_SCAN_CHARS);
    expect(detectQuota(answer)).toBeNull();
  });

  it("une sortie de quota reste reconnue après un long préambule", () => {
    const output = `${"progression normale\n".repeat(60_000)}5-hour limit reached ∙ resets 3pm`;
    expect(output.length).toBeGreaterThan(1_000_000);
    expect(detectQuota(output)?.pattern).toBe("five-hour-limit-resets-clock");
  });

  it.each([undefined, null, 42, {}, ["usage limit"]])(
    "entrée non texte %j -> InvalidQuotaError",
    (v) => {
      expect(() => detectQuota(v as unknown as string)).toThrow(InvalidQuotaError);
    },
  );
});

describe("hostile : contrôle, bidi, 1 Mo, ReDoS", () => {
  it("retire séquences ANSI, NUL, contrôles et bidi de l'extrait, sans perdre la détection", () => {
    const hostile = "\u001b[31m\u0000Claude AI‮ usage limit⁦ reached‏|1760000000\u0007\u001b[0m";
    const found = detectQuota(hostile) as QuotaSignal;
    expect(found.pattern).toBe("claude-usage-limit-reached-epoch");
    expect(found.resetAt).toBe(1_760_000_000_000);
    expect(hasForbiddenChars(found.raw)).toBe(false);
    expect(found.raw).not.toContain("\u001b");
  });

  it("un extrait ne dépasse jamais la borne, même pour une ligne géante", () => {
    const found = detectQuota(`5-hour limit reached ∙ resets 3pm${" x".repeat(5000)}`);
    expect(found === null || found.raw.length <= QUOTA_RAW_MAX_CHARS).toBe(true);
  });

  const HOSTILE_INPUTS: readonly (readonly [string, string])[] = [
    ["1 Mo de a", "a".repeat(1_048_576)],
    ["1 Mo d'espaces après limit", `limit${" ".repeat(1_048_576)}`],
    ["limit et resets alternés", "limit resets ".repeat(80_000)],
    ["429 répétés", "HTTP 429 ".repeat(120_000)],
    ["5-hour sans fin", `${"5-hour ".repeat(150_000)}limit`],
    ["retry-after tronqué", `rate_limit_error retry-after:${" ".repeat(500_000)}`],
    ["epoch sans chiffre", `usage limit reached|${"9".repeat(1_000_000)}`],
    ["contrôles", "\u0000\u001b[".repeat(300_000)],
  ];

  it.each(HOSTILE_INPUTS)(
    "%s : borné en temps (pas de backtracking catastrophique)",
    (_n, text) => {
      const start = performance.now();
      detectQuota(text);
      classifyAgentFailure(text);
      expect(performance.now() - start).toBeLessThan(500);
    },
  );

  it("un epoch hors bornes de plausibilité n'est pas retenu comme reprise", () => {
    const found = detectQuota(`Claude AI usage limit reached|${"9".repeat(40)}`);
    expect(found?.resetAt ?? null).toBeNull();
  });
});
