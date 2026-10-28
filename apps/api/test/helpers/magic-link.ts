// Le worker est consommé en processus (pas de Resend) : mêmes sources que celles déployées.
import { CaptureMailSender, startWorker, type Worker } from "@koklo/worker";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { vi } from "vitest";
import { AppModule } from "../../src/app.module.ts";
import { configFor, TEST_AUTH_URL } from "./app.ts";

export const SEED_EMAIL = "admin@demo.koklo.test";

export interface LogSink {
  lines: string[];
  stream: { write: (line: string) => void };
}

export function logSink(): LogSink {
  const lines: string[] = [];
  return { lines, stream: { write: (line: string) => void lines.push(line) } };
}

/** Application réelle (producteur pg-boss réel), journaux au niveau info vers `sink`. */
export async function createMagicLinkApp(
  databaseUrl: string,
  sink: LogSink,
): Promise<INestApplication> {
  const config = { ...configFor({ databaseUrl }), logLevel: "info" as const };
  const app = (
    await Test.createTestingModule({
      imports: [AppModule.forRoot(config, { logStream: sink.stream })],
    }).compile()
  ).createNestApplication();
  await app.init();
  return app;
}

/** Worker réel (pg-boss + handler send-magic-link) dont l'envoi est capturé en mémoire. */
export async function startCaptureWorker(
  databaseUrl: string,
  sink: LogSink,
): Promise<{ worker: Worker; sender: CaptureMailSender }> {
  const sender = new CaptureMailSender();
  const worker = await startWorker(
    {
      databaseUrl,
      appEnv: "test",
      appVersion: "dev",
      logLevel: "debug",
      sentryDsn: undefined,
      mail: { kind: "capture" },
    },
    { mailSender: sender, logStream: sink.stream },
  );
  return { worker, sender };
}

export function requestMagicLink(app: INestApplication, email: string) {
  return request(app.getHttpServer())
    .post("/api/auth/sign-in/magic-link")
    .set("Origin", TEST_AUTH_URL)
    .send({ email, callbackURL: "/" });
}

export interface MagicLink {
  url: string;
  path: string;
  token: string;
}

/** Lien du dernier email capturé ; attend (sans sleep fixe) qu'un nouvel email soit arrivé. */
export async function nextMagicLink(sender: CaptureMailSender, count: number): Promise<MagicLink> {
  await vi.waitFor(() => expectLength(sender, count), { timeout: 30_000, interval: 100 });
  const message = sender.sent[count - 1];
  const url = /https?:\/\/\S+magic-link\/verify\S*/.exec(message?.text ?? "")?.[0] ?? "";
  const parsed = new URL(url);
  return {
    url,
    path: parsed.pathname + parsed.search,
    token: parsed.searchParams.get("token") ?? "",
  };
}

function expectLength(sender: CaptureMailSender, count: number): void {
  if (sender.sent.length < count) {
    throw new Error(`${sender.sent.length} email(s) capturé(s), ${count} attendu(s)`);
  }
}

export function cookiesOf(response: { headers: Record<string, unknown> }): string[] {
  const raw = response.headers["set-cookie"];
  return (Array.isArray(raw) ? (raw as string[]) : []).map((cookie) => cookie.split(";")[0] ?? "");
}
