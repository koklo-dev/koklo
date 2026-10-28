import { describe, expect, it } from "vitest";
import { CaptureMailSender } from "../mail/capture-mail-sender.ts";
import type { MailSender } from "../mail/mail-sender.ts";
import { createSendMagicLinkHandler, SEND_MAGIC_LINK_QUEUE } from "./send-magic-link.ts";

const URL_OK = "http://localhost:3000/api/auth/magic-link/verify?token=tok123&callbackURL=%2F";

describe("job send-magic-link (TK-22)", () => {
  it("la file s'appelle send-magic-link", () => {
    expect(SEND_MAGIC_LINK_QUEUE).toBe("send-magic-link");
  });

  it("envoie exactement un email au destinataire du payload, avec le lien", async () => {
    const sender = new CaptureMailSender();
    await createSendMagicLinkHandler(sender)({
      id: "job-1",
      data: { email: "alice@example.test", url: URL_OK },
    });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.to).toBe("alice@example.test");
    expect(sender.sent[0]?.text).toContain(URL_OK);
  });

  it("relance l'erreur de l'envoi pour que pg-boss réessaie", async () => {
    const failing: MailSender = {
      send: async () => {
        throw new Error("provider unavailable");
      },
    };
    await expect(
      createSendMagicLinkHandler(failing)({
        id: "job-2",
        data: { email: "a@b.test", url: URL_OK },
      }),
    ).rejects.toThrow("provider unavailable");
  });

  it("rejette un payload sans email ou sans url, sans rien envoyer", async () => {
    const sender = new CaptureMailSender();
    const handler = createSendMagicLinkHandler(sender);
    await expect(handler({ id: "job-3", data: { url: URL_OK } as never })).rejects.toThrow();
    await expect(handler({ id: "job-4", data: { email: "a@b.test" } as never })).rejects.toThrow();
    expect(sender.sent).toEqual([]);
  });
});
