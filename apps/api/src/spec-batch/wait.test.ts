import { describe, expect, it } from "vitest";
import { pollUntil } from "./wait.ts";

describe("pollUntil", () => {
  it("rend aussitôt une valeur déjà terminée, sans lecture", async () => {
    let reads = 0;
    const value = await pollUntil(
      "done",
      async () => {
        reads += 1;
        return "x";
      },
      (v) => v === "done",
      1000,
    );
    expect([value, reads]).toEqual(["done", 0]);
  });

  it("relit jusqu'à la valeur terminée", async () => {
    const values = ["open", "open", "done"];
    const value = await pollUntil(
      "open",
      async () => values.shift() ?? null,
      (v) => v === "done",
      2000,
    );
    expect(value).toBe("done");
  });

  it("garde la dernière valeur quand le délai expire ou que la lecture ne rend rien", async () => {
    const started = performance.now();
    const value = await pollUntil<string>(
      "open",
      async () => null,
      (v) => v === "done",
      200,
    );
    expect(value).toBe("open");
    expect(performance.now() - started).toBeGreaterThanOrEqual(190);
  });
});
