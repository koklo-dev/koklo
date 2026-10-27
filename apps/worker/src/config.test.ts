import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";

describe("loadConfig", () => {
  it("reads DATABASE_URL", () => {
    expect(loadConfig({ DATABASE_URL: "postgres://x" })).toEqual({ databaseUrl: "postgres://x" });
  });

  it("fails when DATABASE_URL is missing", () => {
    expect(() => loadConfig({})).toThrow("DATABASE_URL is required");
  });
});
