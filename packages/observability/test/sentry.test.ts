import * as Sentry from "@sentry/node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureError, initObservability } from "../src/index.ts";

vi.mock("@sentry/node", () => ({ init: vi.fn(), captureException: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("initObservability (TK-19)", () => {
  it.each([undefined, ""])("sans DSN (%j) : no-op, le SDK n'est pas initialisé", (dsn) => {
    const enabled = initObservability({ dsn, environment: "test", release: "1.0.0" });
    expect(enabled).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("avec DSN : init appelé une fois avec dsn, environnement et release", () => {
    const dsn = "https://clef@glitchtip.example.com/1";
    const enabled = initObservability({ dsn, environment: "staging", release: "2.3.4" });
    expect(enabled).toBe(true);
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn, environment: "staging", release: "2.3.4" }),
    );
  });
});

describe("captureError (TK-19)", () => {
  it("transmet l'erreur au SDK avec le contexte de corrélation en tags", () => {
    const error = new Error("boom");
    captureError(error, { requestId: "req-1" });
    expect(Sentry.captureException).toHaveBeenCalledWith(error, { tags: { requestId: "req-1" } });
  });

  it("fonctionne sans contexte", () => {
    const error = new Error("boom");
    captureError(error);
    expect(Sentry.captureException).toHaveBeenCalledWith(error, expect.anything());
  });

  it("ne lève jamais, même si le SDK échoue", () => {
    vi.mocked(Sentry.captureException).mockImplementationOnce(() => {
      throw new Error("sdk cassé");
    });
    expect(() => captureError(new Error("boom"), { requestId: "r" })).not.toThrow();
  });
});
