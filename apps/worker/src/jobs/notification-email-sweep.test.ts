import { createLogger } from "@koklo/observability";
import { describe, expect, it } from "vitest";
import type { NotificationEmailStore } from "../notification/store.ts";
import { SWEEP_BATCH_SIZE, SWEEP_WINDOW_HOURS } from "../notification/types.ts";
import {
  createNotificationSweepHandler,
  NOTIFICATION_EMAIL_SWEEP_CRON,
  NOTIFICATION_EMAIL_SWEEP_QUEUE,
  NOTIFICATION_EMAIL_SWEEP_TIMEZONE,
  type NotificationJobQueue,
} from "./notification-email-sweep.ts";
import { SEND_NOTIFICATION_EMAIL_QUEUE } from "./send-notification-email.ts";

/** TK-58c : balayage planifié des notifications `pending` (D1), tout en mémoire. */
const NOW = new Date("2026-11-02T10:00:00.000Z");
const ID_A = "01900000-0000-7000-8000-00000000000a";
const ID_B = "01900000-0000-7000-8000-00000000000b";
const ID_C = "01900000-0000-7000-8000-00000000000c";

type SweepStore = Pick<NotificationEmailStore, "withPendingBatch">;
interface Sent {
  name: string;
  data: object;
  options: { singletonKey: string };
}

function fixture(ids: readonly string[], opts: { failOn?: string } = {}) {
  const lines: string[] = [];
  const logger = createLogger({
    level: "debug",
    destination: { write: (l) => void lines.push(l) },
  });
  const batches: { now: Date; limit: number; windowHours: number }[] = [];
  const sent: Sent[] = [];
  const store: SweepStore = {
    withPendingBatch: async (options, handler) => {
      batches.push(options);
      return handler(ids);
    },
  };
  const queue: NotificationJobQueue = {
    send: async (name, data, options) => {
      if (opts.failOn === options.singletonKey) throw new Error("queue unavailable");
      sent.push({ name, data, options });
      return `job-${options.singletonKey}`;
    },
  };
  const run = () => createNotificationSweepHandler({ store, queue, logger, now: () => NOW })();
  return { run, batches, sent, lines };
}

describe("constantes du balayage (TK-58c)", () => {
  it("file notification-email-sweep, cron chaque minute en UTC", () => {
    expect(NOTIFICATION_EMAIL_SWEEP_QUEUE).toBe("notification-email-sweep");
    expect(SEND_NOTIFICATION_EMAIL_QUEUE).toBe("send-notification-email");
    expect(NOTIFICATION_EMAIL_SWEEP_CRON).toBe("* * * * *");
    expect(NOTIFICATION_EMAIL_SWEEP_TIMEZONE).toBe("UTC");
  });
});

describe("job de balayage (TK-58c)", () => {
  it("demande un lot borné de 50 dans la fenêtre de 24 h, à l'heure courante", async () => {
    const { run, batches } = fixture([]);
    await run();
    expect(batches).toEqual([
      { now: NOW, limit: SWEEP_BATCH_SIZE, windowHours: SWEEP_WINDOW_HOURS },
    ]);
    expect(batches[0]?.limit).toBe(50);
    expect(batches[0]?.windowHours).toBe(24);
  });

  it("enfile un job par notification : donnée = identifiant seul, singletonKey = identifiant", async () => {
    const { run, sent } = fixture([ID_A, ID_B, ID_C]);
    await run();
    expect(sent).toEqual(
      [ID_A, ID_B, ID_C].map((id) => ({
        name: SEND_NOTIFICATION_EMAIL_QUEUE,
        data: { notificationId: id },
        options: { singletonKey: id },
      })),
    );
  });

  it("lot vide : n'enfile rien et termine normalement", async () => {
    const { run, sent } = fixture([]);
    await expect(run()).resolves.toBeUndefined();
    expect(sent).toEqual([]);
  });

  it("relancé sur le même lot : mêmes singletonKey (pg-boss n'en garde qu'un par clé)", async () => {
    const { run, sent } = fixture([ID_A, ID_B]);
    await run();
    await run();
    const keys = sent.map((job) => job.options.singletonKey);
    expect(keys).toEqual([ID_A, ID_B, ID_A, ID_B]);
    expect(sent.every((job) => job.data && "notificationId" in job.data)).toBe(true);
  });
});

describe("job de balayage : pannes (TK-58c)", () => {
  it("une erreur du store ne tue pas le worker : le handler termine et journalise le nom seul", async () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: "debug",
      destination: { write: (l) => void lines.push(l) },
    });
    const store: SweepStore = {
      withPendingBatch: async () => {
        throw new Error("connection refused postgres://user:s3cret@db/koklo");
      },
    };
    const queue: NotificationJobQueue = { send: async () => "id" };
    await expect(
      createNotificationSweepHandler({ store, queue, logger, now: () => NOW })(),
    ).resolves.toBeUndefined();
    const logged = lines.join("\n");
    expect(logged).not.toContain("s3cret");
    expect(logged).not.toContain("connection refused");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("un enfilage en échec n'empêche pas les suivants et ne fait pas échouer le balayage", async () => {
    const { run, sent } = fixture([ID_A, ID_B, ID_C], { failOn: ID_B });
    await expect(run()).resolves.toBeUndefined();
    expect(sent.map((job) => job.options.singletonKey)).toEqual([ID_A, ID_C]);
  });

  it("journalise des nombres, jamais d'identifiant ni de message d'erreur", async () => {
    const { run, lines } = fixture([ID_A, ID_B], { failOn: ID_B });
    await run();
    const logged = lines.join("\n");
    expect(logged).not.toContain(ID_A);
    expect(logged).not.toContain(ID_B);
    expect(logged).not.toContain("queue unavailable");
    expect(lines.length).toBeGreaterThan(0);
  });
});
