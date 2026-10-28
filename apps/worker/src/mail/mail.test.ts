import { describe, expect, it, vi } from "vitest";
import { CaptureMailSender } from "./capture-mail-sender.ts";
import { buildMagicLinkMessage } from "./magic-link-message.ts";
import type { MailMessage } from "./mail-sender.ts";
import { ResendMailSender } from "./resend-mail-sender.ts";

const MESSAGE: MailMessage = {
  to: "alice@example.test",
  subject: "Sujet",
  text: "corps texte",
  html: "<p>corps html</p>",
};
const FROM = "Koklo <no-reply@koklo.dev>";

describe("CaptureMailSender", () => {
  it("conserve les messages envoyés, dans l'ordre, relisibles par les tests", async () => {
    const sender = new CaptureMailSender();
    await sender.send(MESSAGE);
    await sender.send({ ...MESSAGE, to: "bob@example.test" });
    expect(sender.sent.map((message) => message.to)).toEqual([
      "alice@example.test",
      "bob@example.test",
    ]);
    sender.clear();
    expect(sender.sent).toEqual([]);
  });
});

describe("ResendMailSender (client Resend simulé : frontière réseau)", () => {
  it("envoie from, to, subject, text et html au client Resend", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "mail_1" }, error: null });
    await new ResendMailSender({ emails: { send } }, FROM).send(MESSAGE);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ from: FROM, ...MESSAGE }));
  });

  it("lève quand Resend renvoie une erreur (pg-boss doit réessayer), sans citer le corps", async () => {
    const error = { name: "validation_error", message: "domain not verified" };
    const send = vi.fn().mockResolvedValue({ data: null, error });
    const sender = new ResendMailSender({ emails: { send } }, FROM);
    const failure = await sender.send({ ...MESSAGE, text: "https://secret.test/?token=abc" }).then(
      () => undefined,
      (caught: unknown) => caught as Error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).not.toContain("token=abc");
  });
});

describe("buildMagicLinkMessage (fonction pure)", () => {
  const url = "http://localhost:3000/api/auth/magic-link/verify?token=tok123&callbackURL=%2F";

  it("adresse le message au destinataire et porte le lien en texte et en html", () => {
    const message = buildMagicLinkMessage({ email: "alice@example.test", url });
    expect(message.to).toBe("alice@example.test");
    expect(message.subject.length).toBeGreaterThan(0);
    expect(message.text).toContain(url);
    expect(message.html.includes(url) || message.html.includes(url.replaceAll("&", "&amp;"))).toBe(
      true,
    );
  });
});
