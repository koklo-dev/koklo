import { createLogger } from "@koklo/observability";
import { describe, expect, it } from "vitest";
import { TransientJobError } from "../job-support.ts";
import { CaptureMailSender } from "../mail/capture-mail-sender.ts";
import { MailDeliveryError } from "../mail/mail-errors.ts";
import type { MailMessage, MailSender } from "../mail/mail-sender.ts";
import { buildNotificationMessage } from "../mail/notification-message.ts";
import type { ClaimResult, NotificationEmailContext } from "../notification/store.ts";
import {
  createSendNotificationEmailHandler,
  NOTIFICATION_EMAIL_DEFAULTS,
  SEND_NOTIFICATION_EMAIL_EXPIRE_SECONDS,
  SEND_NOTIFICATION_EMAIL_QUEUE,
  type SendNotificationEmailDeps,
} from "./send-notification-email.ts";

/** TK-58c : job d'envoi d'une notification (D1), store et fournisseur en mémoire. */
const ID = "01900000-0000-7000-8000-0000000000a1";
const PROJECT = "01900000-0000-7000-8000-0000000000b2";
const WEB = "https://app.koklo.test";
const NOW = new Date("2026-11-02T10:00:00.000Z");
const RETRY_LIMIT = 4;
const ADDRESS = "alice.secret@koklo.test";
const ORG = "Cabinet Secret & Fils";

const CONTEXT: NotificationEmailContext = {
  id: ID,
  type: "baseline.proposed",
  subjectKind: "baseline",
  subjectRef: "baseline-3",
  projectId: PROJECT,
  organizationId: "01900000-0000-7000-8000-0000000000c3",
  organizationName: ORG,
  recipientEmail: ADDRESS,
  recipientEmailVerified: true,
  readAt: null,
  emailState: "pending",
  createdAt: NOW,
};

function fixture(claim: ClaimResult, sender: MailSender = new CaptureMailSender()) {
  const lines: string[] = [];
  const logger = createLogger({
    level: "debug",
    destination: { write: (l) => void lines.push(l) },
  });
  const calls: string[] = [];
  const claims: string[] = [];
  const store: SendNotificationEmailDeps["store"] = {
    claimForSend: async (id) => {
      claims.push(id);
      return claim;
    },
    markSent: async (id, at) => {
      calls.push(`sent:${id}:${at.toISOString()}`);
      return true;
    },
    markSkipped: async (id) => {
      calls.push(`skipped:${id}`);
      return true;
    },
    markFailed: async (id) => {
      calls.push(`failed:${id}`);
      return true;
    },
  };
  const handler = createSendNotificationEmailHandler({
    store,
    mailSender: sender,
    logger,
    webBaseUrl: WEB,
    retryLimit: RETRY_LIMIT,
    now: () => NOW,
  });
  const run = (retryCount = 0, data: unknown = { notificationId: ID }) =>
    handler({ id: "job-1", data, retryCount });
  return { run, calls, claims, lines };
}

const ready: ClaimResult = { kind: "ready", context: CONTEXT };
const failing = (kind: "transient" | "permanent"): MailSender => ({
  send: async () => {
    throw new MailDeliveryError(kind, kind === "transient" ? "provider-unavailable" : "rejected");
  },
});

describe("réglages de la file (TK-58c)", () => {
  it("file send-notification-email, 4 reprises, 30 s, concurrence 4, expiration 120 s", () => {
    expect(SEND_NOTIFICATION_EMAIL_QUEUE).toBe("send-notification-email");
    expect(NOTIFICATION_EMAIL_DEFAULTS).toEqual({
      retryLimit: 4,
      retryDelaySeconds: 30,
      concurrency: 4,
    });
    expect(SEND_NOTIFICATION_EMAIL_EXPIRE_SECONDS).toBe(120);
  });
});

describe("envoi d'une notification prête (TK-58c)", () => {
  it("construit le message figé et l'envoie avec idempotencyKey = notification:<id>", async () => {
    const sender = new CaptureMailSender();
    const { run, claims } = fixture(ready, sender);
    await run();
    expect(claims).toEqual([ID]);
    const expected = buildNotificationMessage({
      notificationId: ID,
      to: ADDRESS,
      type: "baseline.proposed",
      organizationName: ORG,
      projectId: PROJECT,
      subjectKind: "baseline",
      subjectRef: "baseline-3",
      webBaseUrl: WEB,
    });
    expect(sender.sent).toEqual([expected]);
    expect(sender.sent[0]?.idempotencyKey).toBe(`notification:${ID}`);
    expect(sender.sent[0]?.text).toContain(`${WEB}/projects/${PROJECT}/baseline/baseline-3`);
  });

  it("succès : markSent(id, now), rien d'autre", async () => {
    const { run, calls } = fixture(ready);
    await run();
    expect(calls).toEqual([`sent:${ID}:${NOW.toISOString()}`]);
  });

  it("un rejeu après envoi n'envoie pas deux fois (clé d'idempotence)", async () => {
    const sender = new CaptureMailSender();
    const { run } = fixture(ready, sender);
    await run();
    await run(1);
    expect(sender.sent).toHaveLength(1);
  });
});

describe("rien à envoyer (TK-58c)", () => {
  const cases: [string, ClaimResult][] = [
    ["skipped (déjà lue)", { kind: "skipped", reason: "already-read" }],
    ["skipped (destinataire non vérifié)", { kind: "skipped", reason: "unverified-recipient" }],
    ["skipped (type non e-mailé)", { kind: "skipped", reason: "type-not-emailed" }],
    ["settled", { kind: "settled" }],
    ["gone", { kind: "gone" }],
  ];
  it.each(cases)("%s : aucun envoi, aucun marquage, le job termine", async (_name, claim) => {
    const sender = new CaptureMailSender();
    const { run, calls } = fixture(claim, sender);
    await expect(run()).resolves.toBeUndefined();
    expect(sender.sent).toEqual([]);
    expect(calls).toEqual([]); // claimForSend a déjà posé `skipped` lui-même
  });

  it.each([
    ["sans donnée", null],
    ["sans notificationId", {}],
    ["notificationId non UUID", { notificationId: "x'; DROP TABLE notifications;--" }],
    ["notificationId non texte", { notificationId: 42 }],
  ])(
    "payload invalide (%s) : ignoré, sans lecture ni envoi, sans citer la donnée",
    async (_n, data) => {
      const sender = new CaptureMailSender();
      const { run, claims, calls, lines } = fixture(ready, sender);
      await expect(run(0, data)).resolves.toBeUndefined();
      expect(claims).toEqual([]);
      expect(calls).toEqual([]);
      expect(sender.sent).toEqual([]);
      expect(lines.join("\n")).not.toContain("DROP TABLE");
    },
  );
});

describe("pannes d'envoi (TK-58c)", () => {
  it("transitoire avant le dernier essai : lève TransientJobError (code seul), sans marquer", async () => {
    const { run, calls } = fixture(ready, failing("transient"));
    for (const retryCount of [0, 1, RETRY_LIMIT - 1]) {
      const error = await run(retryCount).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(TransientJobError);
      expect((error as TransientJobError<string>).code).toBe("provider-unavailable");
      expect((error as Error).message).not.toContain(ADDRESS);
    }
    expect(calls).toEqual([]);
  });

  it("transitoire au dernier essai (retryCount = retryLimit) : markFailed, le job termine", async () => {
    const { run, calls } = fixture(ready, failing("transient"));
    await expect(run(RETRY_LIMIT)).resolves.toBeUndefined();
    expect(calls).toEqual([`failed:${ID}`]);
  });

  it("permanent : markFailed immédiat, sans relance, quel que soit l'essai", async () => {
    for (const retryCount of [0, 2]) {
      const { run, calls } = fixture(ready, failing("permanent"));
      await expect(run(retryCount)).resolves.toBeUndefined();
      expect(calls).toEqual([`failed:${ID}`]);
    }
  });
});

describe("pannes d'envoi : cas limites (TK-58c)", () => {
  it("erreur inconnue du fournisseur : traitée comme transitoire", async () => {
    const odd: MailSender = {
      send: async () => {
        throw new Error(`boom ${ADDRESS}`);
      },
    };
    const { run, calls } = fixture(ready, odd);
    const error = await run(0).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransientJobError);
    expect((error as Error).message).not.toContain(ADDRESS);
    expect(calls).toEqual([]);
    await expect(run(RETRY_LIMIT)).resolves.toBeUndefined();
    expect(calls).toEqual([`failed:${ID}`]);
  });

  it("message impossible à construire (clé de sujet invalide) : failed sans envoi", async () => {
    const sender = new CaptureMailSender();
    const bad: ClaimResult = { kind: "ready", context: { ...CONTEXT, subjectRef: "<script>" } };
    const { run, calls } = fixture(bad, sender);
    await expect(run()).resolves.toBeUndefined();
    expect(sender.sent).toEqual([]);
    expect(calls).toEqual([`failed:${ID}`]);
  });

  it("une erreur du store (claimForSend) est relancée pour que pg-boss réessaie", async () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: "debug",
      destination: { write: (l) => void lines.push(l) },
    });
    const handler = createSendNotificationEmailHandler({
      store: {
        claimForSend: async () => {
          throw new Error("db down");
        },
        markSent: async () => true,
        markSkipped: async () => true,
        markFailed: async () => true,
      },
      mailSender: new CaptureMailSender(),
      logger,
      webBaseUrl: WEB,
      retryLimit: RETRY_LIMIT,
    });
    await expect(
      handler({ id: "j", data: { notificationId: ID }, retryCount: 0 }),
    ).rejects.toThrow();
  });
});

describe("aucune fuite dans les journaux ni les erreurs (TK-58c)", () => {
  it("ni adresse, ni organisation, ni corps, ni clé dans les logs (succès, permanent, transitoire)", async () => {
    const outputs: string[] = [];
    for (const [sender, retryCount] of [
      [new CaptureMailSender(), 0],
      [failing("permanent"), 0],
      [failing("transient"), 0],
      [failing("transient"), RETRY_LIMIT],
    ] as [MailSender, number][]) {
      const { run, lines } = fixture(ready, sender);
      const error = await run(retryCount).catch((e: unknown) => e);
      outputs.push(
        ...lines,
        String(error),
        JSON.stringify(error, Object.getOwnPropertyNames(Object(error))),
      );
    }
    const all = outputs.join("\n");
    for (const secret of [ADDRESS, ORG, "Cabinet", "notification:", `${WEB}/projects`]) {
      expect(all).not.toContain(secret);
    }
  });

  it("le message envoyé ne porte que le dictionnaire figé, l'organisation, la clé et le lien", async () => {
    const sender = new CaptureMailSender();
    const { run } = fixture(ready, sender);
    await run();
    const message = sender.sent[0] as MailMessage;
    expect(message.headers).toEqual({ "X-Entity-Ref-ID": ID });
    expect(message.to).toBe(ADDRESS);
  });
});
