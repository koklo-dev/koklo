import { describe, it, expect } from "vitest";
import { resolveInitialTheme } from "./theme";

describe("resolveInitialTheme", () => {
  it("prefers a persisted light choice over the OS preference", () => {
    expect(resolveInitialTheme("light", true)).toBe("light");
  });

  it("prefers a persisted dark choice over the OS preference", () => {
    expect(resolveInitialTheme("dark", false)).toBe("dark");
  });

  it("falls back to the OS preference when nothing is stored", () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
    expect(resolveInitialTheme(null, false)).toBe("light");
  });

  it("ignores unrecognised stored values", () => {
    expect(resolveInitialTheme("solarized", true)).toBe("dark");
    expect(resolveInitialTheme("", false)).toBe("light");
  });
});
