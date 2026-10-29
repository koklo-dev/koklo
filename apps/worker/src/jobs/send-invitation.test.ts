import { describe, expect, it } from "vitest";
import { CaptureMailSender } from "../mail/capture-mail-sender.ts";
import { buildInvitationMessage } from "../mail/invitation-message.ts";
import type { MailSender } from "../mail/mail-sender.ts";
import { createSendInvitationHandler, SEND_INVITATION_QUEUE } from "./send-invitation.ts";

const PAYLOAD = {
  email: "invitee@example.test",
  url: "http://localhost:3000/accept-invitation/01900000-0000-7000-8000-000000000abc",
  inviterName: "Alice Admin",
  organizationName: "Cabinet <Martin>",
  role: "designer",
};

describe("message d'invitation (TK-23)", () => {
  it("dit qui invite, l'organisation, le rôle et porte le lien en texte et html", () => {
    const message = buildInvitationMessage(PAYLOAD);
    expect(message.to).toBe(PAYLOAD.email);
    for (const body of [message.text, message.html]) {
      expect(body).toContain("Alice Admin");
      expect(body).toContain("designer");
      expect(body).toContain(PAYLOAD.url);
    }
    expect(message.text).toContain("Cabinet <Martin>");
    expect(message.html).toContain("Cabinet &lt;Martin&gt;");
    expect(message.html).not.toContain("<Martin>");
  });
});

describe("job send-invitation (TK-23)", () => {
  it("la file s'appelle send-invitation", () => {
    expect(SEND_INVITATION_QUEUE).toBe("send-invitation");
  });

  it("envoie exactement un email au destinataire du payload", async () => {
    const sender = new CaptureMailSender();
    await createSendInvitationHandler(sender)({ id: "job-1", data: PAYLOAD });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.to).toBe(PAYLOAD.email);
    expect(sender.sent[0]?.text).toContain(PAYLOAD.url);
  });

  it("relance l'erreur d'envoi pour que pg-boss réessaie", async () => {
    const failing: MailSender = {
      send: async () => {
        throw new Error("provider unavailable");
      },
    };
    await expect(
      createSendInvitationHandler(failing)({ id: "job-2", data: PAYLOAD }),
    ).rejects.toThrow("provider unavailable");
  });

  it("rejette un payload incomplet sans rien envoyer ni citer le lien", async () => {
    const sender = new CaptureMailSender();
    const handler = createSendInvitationHandler(sender);
    for (const key of Object.keys(PAYLOAD)) {
      const { [key as keyof typeof PAYLOAD]: _omitted, ...incomplete } = PAYLOAD;
      const error = await handler({ id: "job-3", data: incomplete }).catch((e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain(PAYLOAD.url);
    }
    expect(sender.sent).toEqual([]);
  });
});
