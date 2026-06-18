import { describe, it, expect, vi } from "vitest";
import { formatVersion, settleVersion } from "./bootModel";

/** A promise that never settles — stands in for "still loading" / "no timeout". */
const never = <T>(): Promise<T> => new Promise<T>(() => {});
/** An immediate delay — lets the timeout branch win deterministically. */
const immediate = () => Promise.resolve();

describe("formatVersion", () => {
  it("prefixes a non-empty version", () => {
    expect(formatVersion("0.1.0")).toBe("v 0.1.0");
  });

  it("trims surrounding whitespace", () => {
    expect(formatVersion("  1.2.3  ")).toBe("v 1.2.3");
  });

  it("returns undefined for empty or missing input", () => {
    expect(formatVersion("")).toBeUndefined();
    expect(formatVersion("   ")).toBeUndefined();
    expect(formatVersion(null)).toBeUndefined();
    expect(formatVersion(undefined)).toBeUndefined();
  });
});

describe("settleVersion", () => {
  it("returns the version when the load wins the race", async () => {
    const result = await settleVersion({
      loadVersion: () => Promise.resolve("0.1.0"),
      timeoutMs: 4000,
      delay: never, // timeout never fires
    });
    expect(result).toBe("0.1.0");
  });

  it("returns undefined when the load rejects (no hang)", async () => {
    const result = await settleVersion({
      loadVersion: () => Promise.reject(new Error("no tauri runtime")),
      timeoutMs: 4000,
      delay: never,
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when the timeout wins (load stalls)", async () => {
    const loadVersion = vi.fn(() => never<string>());
    const result = await settleVersion({
      loadVersion,
      timeoutMs: 10,
      delay: immediate, // timeout resolves immediately
    });
    expect(result).toBeUndefined();
    expect(loadVersion).toHaveBeenCalledOnce();
  });
});
