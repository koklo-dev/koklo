import { ORPCError } from "@orpc/server";
import * as Sentry from "@sentry/node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { guard, type InternalErrors } from "../src/request-context.ts";

vi.mock("@sentry/node", () => ({ init: vi.fn(), captureException: vi.fn() }));

class InternalMarker extends Error {}
const errors: InternalErrors = {
  INTERNAL: ({ data }) => Object.assign(new InternalMarker("INTERNAL"), { data }),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("guard : capture explicite (TK-19)", () => {
  it("une erreur inattendue est transmise au SDK avec le requestId, puis convertie en INTERNAL", async () => {
    const boom = new Error("connexion refusée postgresql://u:pw@h/d");
    await expect(
      guard("req-42", errors, async () => {
        throw boom;
      }),
    ).rejects.toBeInstanceOf(InternalMarker);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({ tags: expect.objectContaining({ requestId: "req-42" }) }),
    );
  });

  it("l'échec du SDK ne change pas la réponse : toujours INTERNAL", async () => {
    vi.mocked(Sentry.captureException).mockImplementationOnce(() => {
      throw new Error("sdk indisponible");
    });
    await expect(
      guard("req-1", errors, async () => {
        throw new Error("boom");
      }),
    ).rejects.toBeInstanceOf(InternalMarker);
  });

  it("une ORPCError volontaire passe telle quelle et n'est pas capturée", async () => {
    const voulue = new ORPCError("NOT_FOUND");
    await expect(
      guard("req-1", errors, async () => {
        throw voulue;
      }),
    ).rejects.toBe(voulue);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("un succès ne capture rien", async () => {
    await expect(guard("req-1", errors, async () => 7)).resolves.toBe(7);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
