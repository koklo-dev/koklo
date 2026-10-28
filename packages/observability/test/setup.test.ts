import * as Sentry from "@sentry/node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupObservability } from "../src/index.ts";

vi.mock("@sentry/node", () => ({ init: vi.fn(), captureException: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setupObservability", () => {
  it("sans DSN : logger JSON utilisable, SDK non initialisé", () => {
    const lines: string[] = [];
    const logger = setupObservability({
      level: "info",
      environment: "test",
      release: "1",
      destination: { write: (line) => lines.push(line) },
    });
    logger.info("bonjour");
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ msg: "bonjour" });
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("avec DSN : SDK initialisé", () => {
    setupObservability({
      level: "silent",
      dsn: "https://clef@glitchtip.example.com/1",
      environment: "test",
      release: "1",
    });
    expect(Sentry.init).toHaveBeenCalledTimes(1);
  });
});
