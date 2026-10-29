import * as Sentry from "@sentry/node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/config.ts";
import { InvitationQueue } from "../src/organization/invitation-queue.ts";

vi.mock("@sentry/node", () => ({ init: vi.fn(), captureException: vi.fn() }));

// Port 1 : connexion refusée immédiatement, aucune base requise.
const unreachable = { databaseUrl: "postgresql://u:pw@127.0.0.1:1/d" } as AppConfig;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("échec d'enfilage (TK-23)", () => {
  it("est signalé au SDK avec la file, puis relancé à Better Auth", async () => {
    const queue = new InvitationQueue(unreachable);
    await expect(
      queue.enqueue({
        email: "a@b.c",
        url: "https://x/accept-invitation/1",
        inviterName: "A",
        organizationName: "O",
        role: "dev",
      }),
    ).rejects.toThrow();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tags: { queue: "send-invitation" } }),
    );
  });
});
