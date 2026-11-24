import { describe, expect, it } from "vitest";
import { rateLimitedReadText } from "../src/lib/git-read-labels.ts";

/** TK-114f lot B, B1 : quota GitHub épuisé, délai arrondi à la minute supérieure (1 au moins). */
const limited = (data?: unknown) =>
  Object.assign(new Error("x"), { code: "PROVIDER_RATE_LIMITED", data });

describe("rateLimitedReadText", () => {
  it.each([
    [1_800_000, "30 min"],
    [61_000, "2 min"],
    [1, "1 min"],
  ])("retryAfterMs %d → « réessayez dans %s. »", (retryAfterMs, delay) => {
    expect(rateLimitedReadText(limited({ retryAfterMs }))).toBe(
      `GitHub limite les lectures, réessayez dans ${delay}.`,
    );
  });

  it.each([
    ["absent", undefined],
    ["sans délai", {}],
    ["nul", { retryAfterMs: 0 }],
    ["négatif", { retryAfterMs: -5 }],
    ["non fini", { retryAfterMs: Number.POSITIVE_INFINITY }],
    ["non numérique", { retryAfterMs: "60000" }],
  ])("délai %s → « un instant »", (_, data) => {
    expect(rateLimitedReadText(limited(data))).toBe(
      "GitHub limite les lectures, réessayez dans un instant.",
    );
  });

  it("autre code, erreur réseau ou valeur quelconque → undefined", () => {
    expect(
      rateLimitedReadText(Object.assign(new Error("x"), { code: "PROVIDER_UNAVAILABLE" })),
    ).toBeUndefined();
    expect(rateLimitedReadText(new Error("boom"))).toBeUndefined();
    expect(rateLimitedReadText(undefined)).toBeUndefined();
    expect(rateLimitedReadText(null)).toBeUndefined();
  });
});
