import { describe, expect, it } from "vitest";
import { InvalidRunStateError, resumePoint } from "../src/index.ts";
import { runAt } from "./helpers.ts";

describe("resumePoint : état inconnu", () => {
  it("lève InvalidRunStateError plutôt que de prendre le run pour terminé", () => {
    const run = { ...runAt("leased"), state: "bogus" } as never;
    expect(() => resumePoint(run)).toThrow(InvalidRunStateError);
  });
});
