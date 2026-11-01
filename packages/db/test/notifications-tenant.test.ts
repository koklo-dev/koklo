import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as dbPackage from "../src/index.ts";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import {
  insertNotification,
  NOTIFICATION_MODELS,
  type NotificationScope,
  notificationScope,
} from "./support/notifications-fixtures.ts";

const {
  createDbClient,
  createRawDbClient,
  withOrganization,
  TENANT_MODELS,
  TENANT_EXCLUDED_MODELS,
} = dbPackage;

/** Le modèle de TK-51d n'existe pas encore dans le client généré : délégué typé à la main. */
interface Row {
  id: string;
  organizationId: string;
  recipientUserId: string;
  readAt: Date | null;
}
interface Delegate {
  findMany: (args?: unknown) => Promise<Row[]>;
  findFirst: (args?: unknown) => Promise<Row | null>;
  count: (args?: unknown) => Promise<number>;
  create: (args: unknown) => Promise<Row>;
  createMany: (args: unknown) => Promise<{ count: number }>;
  update: (args: unknown) => Promise<Row>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
  delete: (args: unknown) => Promise<Row>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
}
type Client = Record<"notification", Delegate>;

let database: TestDatabase;
let tenant: ReturnType<typeof createDbClient> & Client;
let raw: ReturnType<typeof createRawDbClient> & Client;
let a: NotificationScope;
let b: NotificationScope;
const ids = { a: "", b: "" };

beforeAll(async () => {
  database = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], database.url);
  a = await notificationScope(database, "nt-tenant-a");
  b = await notificationScope(database, "nt-tenant-b");
  ids.a = await insertNotification(database, a);
  ids.b = await insertNotification(database, b);
  tenant = createDbClient(database.url) as never;
  raw = createRawDbClient(database.url) as never;
}, 180_000);

afterAll(async () => {
  await tenant?.$disconnect();
  await raw?.$disconnect();
  await database?.dispose();
}, 60_000);

const data = (scope: NotificationScope, extra: Record<string, unknown> = {}) => ({
  recipientUserId: scope.userId,
  projectId: scope.projectId,
  type: "review.submitted",
  subjectKind: "review",
  subjectRef: "r-1",
  dedupeKey: `tenant:${Math.random()}`,
  ...extra,
});

describe("TK-51d : modèle multi-tenant", () => {
  it("Notification est dans TENANT_MODELS, hors exclusions", () => {
    for (const model of NOTIFICATION_MODELS) {
      expect([...TENANT_MODELS], model).toContain(model);
      expect(TENANT_EXCLUDED_MODELS).not.toHaveProperty(model);
    }
  });

  it("sous withOrganization(A), les lignes de B sont invisibles, et inversement", async () => {
    const seen = async (org: string) =>
      (await withOrganization(org, () => tenant.notification.findMany())).map((r) => r.id);
    expect(await seen(a.organizationId)).toContain(ids.a);
    expect(await seen(a.organizationId)).not.toContain(ids.b);
    expect(await seen(b.organizationId)).toContain(ids.b);
    expect(await seen(b.organizationId)).not.toContain(ids.a);
    expect(
      await withOrganization(a.organizationId, () =>
        tenant.notification.findFirst({ where: { id: ids.b } }),
      ),
    ).toBeNull();
    expect(
      await withOrganization(a.organizationId, () =>
        tenant.notification.count({ where: { id: ids.b } }),
      ),
    ).toBe(0);
  });

  it("sans contexte d'organisation, l'accès est refusé", async () => {
    await expect(tenant.notification.findMany()).rejects.toBeInstanceOf(
      dbPackage.MissingOrganizationContextError,
    );
  });

  it("le client brut est le seul chemin transversal (worker) : il voit les deux", async () => {
    expect((await raw.notification.findMany()).map((r) => r.id)).toEqual(
      expect.arrayContaining([ids.a, ids.b]),
    );
  });
});

describe("TK-51d : écritures sous contexte d'organisation", () => {
  it("create sans organizationId affecte l'organisation du contexte", async () => {
    const created = await withOrganization(b.organizationId, () =>
      tenant.notification.create({ data: data(b) }),
    );
    expect(created.organizationId).toBe(b.organizationId);
    expect(created.readAt).toBeNull();
  });

  it("create avec l'organizationId d'une autre organisation est refusé", async () => {
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.notification.create({ data: data(a, { organizationId: b.organizationId }) }),
      ),
    ).rejects.toBeInstanceOf(dbPackage.OrganizationMismatchError);
  });

  it("notifier un destinataire ou un projet d'une autre organisation échoue (FK composites)", async () => {
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.notification.create({ data: data(a, { recipientUserId: b.userId }) }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.notification.create({ data: data(a, { projectId: b.projectId }) }),
      ),
    ).rejects.toThrow();
  });

  it("le rejeu d'une même clé de déduplication est un conflit (une seule ligne)", async () => {
    const dedupeKey = "tenant:replay";
    await withOrganization(a.organizationId, () =>
      tenant.notification.create({ data: data(a, { dedupeKey }) }),
    );
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.notification.create({ data: data(a, { dedupeKey }) }),
      ),
    ).rejects.toThrow();
    const replay = await withOrganization(a.organizationId, () =>
      tenant.notification.createMany({ data: [data(a, { dedupeKey })], skipDuplicates: true }),
    );
    expect(replay.count).toBe(0);
    expect(await raw.notification.count({ where: { dedupeKey } })).toBe(1);
  });

  it("marquer lue sa propre notification fonctionne (aucun trigger d'immutabilité)", async () => {
    const updated = await withOrganization(a.organizationId, () =>
      tenant.notification.update({ where: { id: ids.a }, data: { readAt: new Date() } }),
    );
    expect(updated.readAt).not.toBeNull();
  });
});

describe("TK-51d : écritures sans effet sur l'autre organisation", () => {
  it("update, delete, updateMany et deleteMany visant l'autre organisation n'ont aucun effet", async () => {
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.notification.update({ where: { id: ids.b }, data: { readAt: new Date() } }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.notification.delete({ where: { id: ids.b } }),
      ),
    ).rejects.toThrow();
    const updated = await withOrganization(a.organizationId, () =>
      tenant.notification.updateMany({ where: { id: ids.b }, data: { readAt: new Date() } }),
    );
    const deleted = await withOrganization(a.organizationId, () =>
      tenant.notification.deleteMany({ where: { id: ids.b } }),
    );
    expect([updated.count, deleted.count]).toEqual([0, 0]);
    const kept = await raw.notification.findFirst({ where: { id: ids.b } });
    expect(kept?.readAt).toBeNull();
  });
});
