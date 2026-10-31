import { describe, expect, it } from "vitest";
import {
  FIRST_POLL_MS,
  INDEX_LIMIT_MS,
  INDEX_POLL_MS,
  POLL_FACTOR,
  POLL_MAX_MS,
  pollDelay,
  TRACKING_LIMIT_MS,
} from "../src/lib/feature-tracking.ts";

/** TK-48 / 48e : rythme et bornes du suivi d'un enregistrement (S-feature-form §4.4, §4.5). */
describe("feature-tracking", () => {
  it("constantes : 1,5 s, x1,5, plafond 5 s, borne 60 s ; index 2 s, borne 30 s", () => {
    expect([FIRST_POLL_MS, POLL_FACTOR, POLL_MAX_MS, TRACKING_LIMIT_MS]).toEqual([
      1500, 1.5, 5000, 60_000,
    ]);
    expect([INDEX_POLL_MS, INDEX_LIMIT_MS]).toEqual([2000, 30_000]);
  });

  it("pollDelay : 1500, 2250, 3375 puis plafonné à 5000", () => {
    expect([0, 1, 2, 3, 4, 10, 100].map(pollDelay)).toEqual([
      1500, 2250, 3375, 5000, 5000, 5000, 5000,
    ]);
  });
});
