import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module.ts";
import { configFor } from "./app.ts";
import { send } from "./tickets.ts";

/** Horloge de test (port CLOCK de TK-31) : instant ISO UTC contrôlé, jamais d'attente réelle. */
export class ManualClock {
  private current: number;

  constructor(start: Date = new Date()) {
    this.current = start.getTime();
  }

  now(): string {
    return new Date(this.current).toISOString();
  }

  advance(ms: number): void {
    this.current += ms;
  }
}

/** Application réelle dont seul le port CLOCK est remplacé par `clock`. */
export async function createAppWithClock(
  databaseUrl: string,
  clock: ManualClock,
): Promise<INestApplication> {
  const { CLOCK } = await import("../../src/clock.ts");
  const app = (
    await Test.createTestingModule({ imports: [AppModule.forRoot(configFor({ databaseUrl }))] })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .compile()
  ).createNestApplication();
  await app.init();
  return app;
}

export const LEASE_DEFAULTS = { branch: "feat/tk-x", worktree: "/srv/worktrees/tk-x" } as const;

/** Client des procédures lease.* et projectState.* du contrat 0.4.0 (HTTP réel). */
export function collaborationFor(app: INestApplication, actor: { cookie: string } | undefined) {
  const cookie = actor?.cookie;
  return {
    acquire: (key: string, over: Record<string, unknown> = {}) =>
      send(app, cookie, "post", `/tickets/${key}/lease`, { key, ...LEASE_DEFAULTS, ...over }),
    heartbeat: (key: string) =>
      send(app, cookie, "post", `/tickets/${key}/lease/heartbeat`, { key }),
    release: (key: string) => send(app, cookie, "delete", `/tickets/${key}/lease`),
    getLease: (key: string) => send(app, cookie, "get", `/tickets/${key}/lease`),
    getState: () => send(app, cookie, "get", "/project-state"),
    updateState: (expectedVersion: number, content: Record<string, unknown>) =>
      put(app, cookie, "/project-state", { expectedVersion, content }),
  };
}

export interface LeaseRow {
  id: string;
  holder_kind: string;
  holder_id: string;
  released_at: Date | null;
  expires_at: Date;
  heartbeat_at: Date;
}

export function leaseRows(database: TestDatabase, ticketId: string): Promise<LeaseRow[]> {
  return database.query<LeaseRow>(
    `SELECT id, holder_kind, holder_id, released_at, expires_at, heartbeat_at
       FROM leases WHERE ticket_id = $1 ORDER BY acquired_at, id`,
    [ticketId],
  );
}

export function activeLeaseCount(database: TestDatabase, ticketId: string): Promise<number> {
  return database
    .query<{ n: number }>(
      "SELECT count(*)::int AS n FROM leases WHERE ticket_id = $1 AND released_at IS NULL",
      [ticketId],
    )
    .then((rows) => rows[0]?.n ?? 0);
}

export function auditCount(
  database: TestDatabase,
  organizationId: string,
  action: string,
): Promise<number> {
  return database
    .query<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_log WHERE organization_id = $1 AND action = $2",
      [organizationId, action],
    )
    .then((rows) => rows[0]?.n ?? 0);
}

/** PUT (absent de `send`, dont le type de méthode est partagé par les tests de TK-30). */
function put(app: INestApplication, cookie: string | undefined, path: string, body: unknown) {
  const req = request(app.getHttpServer()).put(path);
  if (cookie) {
    req.set("Cookie", cookie);
  }
  return req.send(body as object);
}
