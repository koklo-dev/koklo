import { describe, expect, it } from "vitest";
import { isMailDeliveryError, type MailDeliveryError } from "../../src/mail/mail-errors.ts";
import { MAIL_HEADER_ALLOWLIST } from "../../src/mail/mail-guards.ts";
import type { MailMessage, MailSender } from "../../src/mail/mail-sender.ts";

/**
 * Banc d'essai neuf d'un adaptateur : le port, ce qu'il a réellement remis, et un moyen de scripter
 * le prochain échec. Chaque appel de la fabrique renvoie un banc indépendant.
 */
export interface MailSenderHarness {
  readonly sender: MailSender;
  /** Messages réellement remis (dédoublonnés par clé d'idempotence, comme le fournisseur). */
  delivered(): readonly MailMessage[];
  /** Le prochain `send` échoue avec ce type, une seule fois. */
  failNext(kind: "transient" | "permanent"): void;
}

const MESSAGE: MailMessage = {
  to: "alice@example.test",
  subject: "Une validation vous est demandée",
  text: "texte SENTINEL-BODY-TEXT",
  html: "<p>html SENTINEL-BODY-HTML</p>",
};

async function failureOf(promise: Promise<void>): Promise<MailDeliveryError | Error | undefined> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  return undefined;
}

/**
 * Suite de conformité du port `MailSender` (TK-58a) : appliquée à `CaptureMailSender` et à
 * `ResendMailSender` à transport simulé. Aucune de ces vérifications n'ouvre le réseau.
 */
export function runMailSenderConformance(name: string, create: () => MailSenderHarness): void {
  deliveryCases(name, create);
  failureCases(name, create);
}

function deliveryCases(name: string, create: () => MailSenderHarness): void {
  describe(`conformité du port MailSender (remise) : ${name}`, () => {
    it("remet un message avec to, subject, text et html intacts", async () => {
      const { sender, delivered } = create();
      await sender.send(MESSAGE);
      expect(delivered()).toHaveLength(1);
      expect(delivered()[0]).toMatchObject(MESSAGE);
    });

    it("deux messages sans clé sont deux envois", async () => {
      const { sender, delivered } = create();
      await sender.send(MESSAGE);
      await sender.send(MESSAGE);
      expect(delivered()).toHaveLength(2);
    });

    it("la même clé d'idempotence ne remet qu'un seul message", async () => {
      const { sender, delivered } = create();
      await sender.send({ ...MESSAGE, idempotencyKey: "notification:n1" });
      await sender.send({ ...MESSAGE, idempotencyKey: "notification:n1" });
      expect(delivered()).toHaveLength(1);
    });

    it("des clés différentes sont des envois différents", async () => {
      const { sender, delivered } = create();
      await sender.send({ ...MESSAGE, idempotencyKey: "notification:n1" });
      await sender.send({ ...MESSAGE, idempotencyKey: "notification:n2" });
      expect(delivered()).toHaveLength(2);
    });

    it("conserve la clé d'idempotence sur le message remis", async () => {
      const { sender, delivered } = create();
      await sender.send({ ...MESSAGE, idempotencyKey: "notification:n1" });
      expect(delivered()[0]?.idempotencyKey).toBe("notification:n1");
    });
  });
}

function failureCases(name: string, create: () => MailSenderHarness): void {
  describe(`conformité du port MailSender (échecs) : ${name}`, () => {
    it.each(["transient", "permanent"] as const)(
      "un échec %s lève MailDeliveryError typée, sans citer adresse ni corps ni clé",
      async (kind) => {
        const { sender, delivered, failNext } = create();
        failNext(kind);
        const error = await failureOf(
          sender.send({ ...MESSAGE, idempotencyKey: "notification:SENTINEL-KEY" }),
        );
        expect(isMailDeliveryError(error)).toBe(true);
        expect((error as MailDeliveryError).kind).toBe(kind);
        expect(error?.message).not.toContain(MESSAGE.to);
        expect(error?.message).not.toContain("SENTINEL-BODY");
        expect(error?.message).not.toContain("SENTINEL-KEY");
        expect(delivered()).toHaveLength(0);
      },
    );

    it("après un échec transitoire, le renvoi avec la même clé aboutit une seule fois", async () => {
      const { sender, delivered, failNext } = create();
      const message = { ...MESSAGE, idempotencyKey: "notification:n1" };
      failNext("transient");
      await failureOf(sender.send(message));
      await sender.send(message);
      await sender.send(message);
      expect(delivered()).toHaveLength(1);
    });

    it.each([
      ["to", { to: "alice@example.test\r\nBcc: evil@example.test" }],
      ["to (NUL)", { to: "alice@example.test\0" }],
      ["to (deux adresses)", { to: "a@example.test, b@example.test" }],
      ["subject", { subject: "Sujet\r\nBcc: evil@example.test" }],
      ["idempotencyKey", { idempotencyKey: "k\r\nX-Evil: 1" }],
      ["idempotencyKey (NUL)", { idempotencyKey: "k\0" }],
      ["en-tête hors liste blanche", { headers: { "List-Unsubscribe": "<https://web.test/u>" } }],
      ["valeur d'en-tête piégée", { headers: { [MAIL_HEADER_ALLOWLIST[0] as string]: "a\r\nb" } }],
    ] as const)("refuse %s (permanent, rien n'est remis)", async (_label, override) => {
      const { sender, delivered } = create();
      const error = await failureOf(sender.send({ ...MESSAGE, ...override } as MailMessage));
      expect(isMailDeliveryError(error)).toBe(true);
      expect((error as MailDeliveryError).kind).toBe("permanent");
      expect((error as MailDeliveryError).code).toBe("invalid-message");
      expect(error?.message).not.toContain("evil@example.test");
      expect(delivered()).toHaveLength(0);
    });
  });
}
