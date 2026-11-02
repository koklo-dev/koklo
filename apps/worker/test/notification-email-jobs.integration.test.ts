import { createRawDbClient, type PrismaClient } from "@koklo/db";
import { createLogger } from "@koklo/observability";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTIFICATION_EMAIL_SWEEP_QUEUE } from "../src/jobs/notification-email-sweep.ts";
import {
  createSendNotificationEmailHandler,
  SEND_NOTIFICATION_EMAIL_QUEUE,
} from "../src/jobs/send-notification-email.ts";
import { CaptureMailSender } from "../src/mail/capture-mail-sender.ts";
import { MailDeliveryError, type MailDeliveryKind } from "../src/mail/mail-errors.ts";
import type { MailMessage, MailSender } from "../src/mail/mail-sender.ts";
import { NotificationEmailStore } from "../src/notification/store.ts";
import { startWorker, type Worker } from "../src/worker.ts";
import { NotificationBench } from "./support/notification-bench.ts";

/**
 * TK-58c : files, planification et « Emails capturés en test » de bout en bout (Postgres et pg-boss
 * réels, envoi capturé). Le balayage est déclenché à la main (`boss.send`) : jamais d'attente du cron.
 */
const WEB = "http://web.test:3000";
const WAIT = 45_000;
const lines: string[] = [];
const logStream = { write: (line: string) => void lines.push(line) };

/** Capture + échecs scriptés par clé d'idempotence (déterministe malgré le cron et les reprises). */
class ScriptedSender implements MailSender {
  readonly capture = new CaptureMailSender();
  private readonly script = new Map<string, MailDeliveryKind[]>();
  readonly attempts = new Map<string, number>();
  readonly inFlight = new Map<string, number>();
  readonly maxInFlight = new Map<string, number>();
  private readonly delays = new Map<string, number>();
  slow(key: string, ms: number): void {
    this.delays.set(key, ms);
  }
  failures(key: string, ...kinds: MailDeliveryKind[]): void {
    this.script.set(key, kinds);
  }
  async send(message: MailMessage): Promise<void> {
    const key = message.idempotencyKey ?? "";
    this.attempts.set(key, (this.attempts.get(key) ?? 0) + 1);
    const running = (this.inFlight.get(key) ?? 0) + 1;
    this.inFlight.set(key, running);
    this.maxInFlight.set(key, Math.max(this.maxInFlight.get(key) ?? 0, running));
    try {
      await this.delayOf(key);
    } finally {
      this.inFlight.set(key, running - 1);
    }
    const kind = this.script.get(key)?.shift();
    if (kind !== undefined) {
      throw new MailDeliveryError(kind, kind === "transient" ? "provider-unavailable" : "rejected");
    }
    await this.capture.send(message);
  }
  private async delayOf(key: string): Promise<void> {
    const ms = this.delays.get(key);
    if (ms !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }
  sentFor(id: string): readonly MailMessage[] {
    return this.capture.sent.filter((m) => m.idempotencyKey === `notification:${id}`);
  }
}

let bench: NotificationBench;
let worker: Worker;
let sender: ScriptedSender;
let raw: PrismaClient;

beforeAll(async () => {
  bench = await NotificationBench.create();
  raw = createRawDbClient(bench.url);
  sender = new ScriptedSender();
  worker = await startWorker(
    {
      databaseUrl: bench.url,
      appEnv: "test",
      appVersion: "dev",
      logLevel: "debug" as const,
      sentryDsn: undefined,
      mail: { kind: "capture" as const },
      webBaseUrl: WEB,
    },
    {
      mailSender: sender,
      logStream,
      notificationEmail: { retryLimit: 1, retryDelaySeconds: 1 },
    },
  );
}, 240_000);

beforeEach(() => {
  lines.length = 0;
});

afterAll(async () => {
  await worker?.stop();
  await raw?.$disconnect();
  await bench?.dispose();
});

async function sweep(): Promise<void> {
  const id = await worker.boss.send(NOTIFICATION_EMAIL_SWEEP_QUEUE, {});
  await vi.waitFor(
    async () => {
      const job = await worker.boss.getJobById(NOTIFICATION_EMAIL_SWEEP_QUEUE, id ?? "");
      if (job?.state !== "completed") throw new Error(`balayage : ${job?.state}`);
    },
    { timeout: WAIT, interval: 150 },
  );
}

async function settled(id: string): Promise<string> {
  let state = "";
  await vi.waitFor(
    async () => {
      state = (await bench.stateOf(id))?.email_state ?? "";
      if (state === "pending") throw new Error("encore pending");
    },
    { timeout: WAIT, interval: 150 },
  );
  return state;
}

describe("files et planification (TK-58c)", () => {
  it("le balayage est planifié une fois par minute en UTC, y compris après un redémarrage", async () => {
    const second = await startWorker(
      {
        databaseUrl: bench.url,
        appEnv: "test",
        appVersion: "dev",
        logLevel: "debug" as const,
        sentryDsn: undefined,
        mail: { kind: "capture" as const },
        webBaseUrl: WEB,
      },
      { mailSender: sender, logStream, notificationEmail: { retryLimit: 1, retryDelaySeconds: 1 } },
    );
    await second.stop();
    const schedules = (await worker.boss.getSchedules()).filter(
      (schedule) => schedule.name === NOTIFICATION_EMAIL_SWEEP_QUEUE,
    );
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({ cron: "* * * * *", timezone: "UTC" });
  });

  it("la file de balayage existe, sans reprise (le tick suivant est la reprise)", async () => {
    const queue = await worker.boss.getQueue(NOTIFICATION_EMAIL_SWEEP_QUEUE);
    expect(queue?.retryLimit).toBe(0);
  });
});

describe("Emails capturés en test : de bout en bout (TK-58c)", () => {
  it("baseline.proposed : balayage, envoi, message capturé avec le lien WEB_BASE_URL, état sent", async () => {
    const scene = await bench.scene("e2e");
    const id = await bench.notify(scene, { type: "baseline.proposed" });
    await sweep();
    expect(await settled(id)).toBe("sent");
    const [message, ...rest] = sender.sentFor(id);
    expect(rest).toEqual([]);
    expect(message?.to).toBe(scene.email);
    expect(message?.text).toContain(`${WEB}/projects/${scene.projectId}/baseline/baseline-0`);
    expect(message?.html).toContain(`${WEB}/projects/${scene.projectId}/baseline/baseline-0`);
    expect(message?.idempotencyKey).toBe(`notification:${id}`);
    expect((await bench.stateOf(id))?.emailed_at).toBeInstanceOf(Date);
  });

  it("aucune fuite : ni adresse ni nom d'organisation dans les journaux du worker", async () => {
    const scene = await bench.scene("leak");
    const id = await bench.notify(scene);
    await sweep();
    expect(await settled(id)).toBe("sent");
    const logged = lines.join("\n");
    expect(logged).not.toContain(scene.email);
    expect(logged).not.toContain(scene.organizationName);
  });
});

describe("Emails capturés en test : notifications sans e-mail (TK-58c)", () => {
  it("types non e-mailés : skipped, aucun message", async () => {
    const scene = await bench.scene("types");
    const ids = [
      await bench.notify(scene, {
        type: "suggestion.decided",
        subjectKind: "suggestion",
        subjectRef: "SG-1",
      }),
      await bench.notify(scene, { type: "baseline.validated" }),
      await bench.notify(scene, { type: "baseline.tagged" }),
    ];
    await sweep();
    for (const id of ids) {
      expect(await settled(id)).toBe("skipped");
      expect(sender.sentFor(id)).toEqual([]);
    }
  });

  it("destinataire non vérifié ou notification déjà lue : skipped, aucun message", async () => {
    const unverified = await bench.scene("unverified", { verified: false });
    const read = await bench.scene("read");
    const a = await bench.notify(unverified);
    const b = await bench.notify(read, { readAt: new Date() });
    await sweep();
    for (const id of [a, b]) {
      expect(await settled(id)).toBe("skipped");
      expect(sender.sentFor(id)).toEqual([]);
    }
  });

  it("hors fenêtre de 24 h ou déjà réglée : jamais envoyée", async () => {
    const scene = await bench.scene("window");
    const old = await bench.notify(scene, { ageHours: 30 });
    const done = await bench.notify(scene, { emailState: "sent" });
    await sweep();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect((await bench.stateOf(old))?.email_state).toBe("pending");
    expect(sender.sentFor(old)).toEqual([]);
    expect(sender.sentFor(done)).toEqual([]);
  });

  it("balayage relancé deux fois : un seul message pour la notification", async () => {
    const scene = await bench.scene("twice");
    const id = await bench.notify(scene);
    await Promise.all([sweep(), sweep()]);
    await settled(id);
    await sweep();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(sender.sentFor(id)).toHaveLength(1);
  });
});

describe("unicité réelle des envois (revue TK-58 B1)", () => {
  it("la file d'envoi garantit l'unicité par clé (politique exclusive)", async () => {
    const queue = await worker.boss.getQueue(SEND_NOTIFICATION_EMAIL_QUEUE);
    expect(queue?.policy).toBe("exclusive");
  });

  it("sender lent et balayages répétés : un seul envoi, jamais failed, état final sent", async () => {
    const scene = await bench.scene("slow");
    const id = await bench.notify(scene);
    const key = `notification:${id}`;
    sender.slow(key, 4000);
    await sweep();
    await new Promise((resolve) => setTimeout(resolve, 600)); // le job est actif
    await sweep();
    await sweep();
    expect(await settled(id)).toBe("sent");
    await sweep();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(sender.attempts.get(key)).toBe(1);
    expect(sender.maxInFlight.get(key)).toBe(1);
    expect(sender.sentFor(id)).toHaveLength(1);
    expect((await bench.stateOf(id))?.email_state).toBe("sent");
  }, 60_000);

  it("deux jobs concurrents forcés sur la même notification : jamais failed, un seul message", async () => {
    const scene = await bench.scene("forced");
    const id = await bench.notify(scene);
    sender.slow(`notification:${id}`, 2500);
    await Promise.all([
      worker.boss.send(SEND_NOTIFICATION_EMAIL_QUEUE, { notificationId: id }, { singletonKey: id }),
      worker.boss.send(SEND_NOTIFICATION_EMAIL_QUEUE, { notificationId: id }, { singletonKey: id }),
    ]);
    expect(await settled(id)).toBe("sent");
    expect(sender.maxInFlight.get(`notification:${id}`)).toBe(1);
    expect(sender.sentFor(id)).toHaveLength(1);
  }, 60_000);
});

describe("famine des types non e-mailés (revue TK-58 B2)", () => {
  it("200 suggestion.created devant une baseline.proposed : elle est envoyée au prochain balayage", async () => {
    const scene = await bench.scene("burst");
    const burst: string[] = [];
    for (let i = 0; i < 200; i += 1) {
      burst.push(
        await bench.notify(scene, {
          type: "suggestion.created",
          subjectKind: "suggestion",
          subjectRef: `SG-${i}`,
          ageHours: 3,
        }),
      );
    }
    const proposed = await bench.notify(scene, { type: "baseline.proposed", ageHours: 0 });
    await sweep();
    expect(await settled(proposed)).toBe("sent");
    expect(sender.sentFor(proposed)).toHaveLength(1);
    const states = await bench.query<{ email_state: string }>(
      "SELECT email_state FROM notifications WHERE id = ANY($1::uuid[])",
      [burst],
    );
    expect(states.every((row) => row.email_state === "skipped")).toBe(true);
    for (const id of burst.slice(0, 5)) expect(sender.sentFor(id)).toEqual([]);
  }, 60_000);
});

describe("Emails capturés en test : pannes (TK-58c)", () => {
  it("panne permanente : failed sans réessai", async () => {
    const scene = await bench.scene("permanent");
    const id = await bench.notify(scene);
    sender.failures(`notification:${id}`, "permanent");
    await sweep();
    expect(await settled(id)).toBe("failed");
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(sender.attempts.get(`notification:${id}`)).toBe(1);
    expect(sender.sentFor(id)).toEqual([]);
  });

  it("panne transitoire puis succès : relancé par pg-boss, un seul message, sent", async () => {
    const scene = await bench.scene("transient");
    const id = await bench.notify(scene);
    sender.failures(`notification:${id}`, "transient");
    await sweep();
    expect(await settled(id)).toBe("sent");
    expect(sender.attempts.get(`notification:${id}`)).toBe(2);
    expect(sender.sentFor(id)).toHaveLength(1);
  });

  it("pannes transitoires jusqu'à épuisement des reprises : failed, sans fuite", async () => {
    const scene = await bench.scene("exhausted");
    const id = await bench.notify(scene);
    sender.failures(`notification:${id}`, "transient", "transient", "transient");
    await sweep();
    expect(await settled(id)).toBe("failed");
    expect(sender.sentFor(id)).toEqual([]);
    const logged = lines.join("\n");
    expect(logged).not.toContain(scene.email);
    expect(logged).not.toContain(scene.organizationName);
  });
});

describe("double exécution concurrente (TK-58c)", () => {
  it("deux handlers sur la même notification : un seul message capturé, un seul marquage", async () => {
    const scene = await bench.scene("race");
    const id = await bench.notify(scene);
    const capture = new CaptureMailSender();
    const handler = createSendNotificationEmailHandler({
      store: new NotificationEmailStore(raw),
      mailSender: capture,
      logger: createLogger({ level: "silent" }),
      webBaseUrl: WEB,
      retryLimit: 4,
    });
    const job = { id: "j", data: { notificationId: id }, retryCount: 0 };
    await Promise.all([handler(job), handler({ ...job, id: "j2" })]);
    expect(capture.sent).toHaveLength(1);
    expect((await bench.stateOf(id))?.email_state).toBe("sent");
  });
});

// Dernier : ce démarrage réécrit la file d'envoi avec les valeurs par défaut.
describe("valeurs par défaut de la file d'envoi (TK-58c)", () => {
  it("la file d'envoi : 4 reprises, 30 s, backoff, expiration 120 s, politique exclusive", async () => {
    const second = await startWorker(
      {
        databaseUrl: bench.url,
        appEnv: "test",
        appVersion: "dev",
        logLevel: "debug" as const,
        sentryDsn: undefined,
        mail: { kind: "capture" as const },
        webBaseUrl: WEB,
      },
      { mailSender: sender, logStream },
    );
    try {
      const queue = await second.boss.getQueue(SEND_NOTIFICATION_EMAIL_QUEUE);
      expect(queue).toMatchObject({
        retryLimit: 4,
        retryDelay: 30,
        retryBackoff: true,
        expireInSeconds: 120,
        policy: "exclusive",
      });
    } finally {
      await second.stop();
    }
  });
});
