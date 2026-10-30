import { randomUUID } from "node:crypto";
import { WEBHOOK_EVENTS } from "@koklo/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { DELIVERY_SQL, deliveryParams, insertDelivery } from "./support/spec-fixtures.ts";
import { openPool, sqlState } from "./support/ticket-fixtures.ts";

const UNIQUE = "23505";
const CHECK = "23514";
const BAD_ENUM = "22P02";
const ON_CONFLICT = `${DELIVERY_SQL} ON CONFLICT (provider, delivery_id) DO NOTHING RETURNING id`;

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
}, 180_000);

afterAll(async () => {
  await db?.dispose();
}, 60_000);

const rowsFor = async (deliveryId: string) =>
  Number(
    (
      await db.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM webhook_deliveries WHERE delivery_id = $1",
        [deliveryId],
      )
    )[0]?.n,
  );

describe("TK-41 C2 dédoublonnage des livraisons de webhook", () => {
  it("deux INSERT ... ON CONFLICT DO NOTHING séquentiels laissent une seule ligne", async () => {
    const deliveryId = randomUUID();

    const first = await db.query(ON_CONFLICT, deliveryParams({ deliveryId }));
    const second = await db.query(ON_CONFLICT, deliveryParams({ deliveryId }));

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(await rowsFor(deliveryId)).toBe(1);
  });

  it("insertions concurrentes (Promise.all sur plusieurs connexions) : une seule ligne, un seul gagnant", async () => {
    const pool = openPool(db.url, 8);
    try {
      const deliveryId = randomUUID();

      const results = await Promise.all(
        Array.from({ length: 8 }, () => pool.query(ON_CONFLICT, deliveryParams({ deliveryId }))),
      );

      expect(results.filter((r) => r.rowCount === 1)).toHaveLength(1);
      expect(await rowsFor(deliveryId)).toBe(1);
    } finally {
      await pool.end();
    }
  });

  it("un insert direct du doublon échoue en 23505", async () => {
    const deliveryId = randomUUID();
    await insertDelivery(db, { deliveryId });

    expect(await sqlState(() => insertDelivery(db, { deliveryId }))).toBe(UNIQUE);
  });

  it("deux delivery_id différents coexistent", async () => {
    await insertDelivery(db);
    await insertDelivery(db);
  });
});

describe("TK-41 C2 dédoublonnage des livraisons de webhook : événements et charge utile", () => {
  it("UNIQUE(provider, delivery_id) est une contrainte unique composite sur ces deux colonnes", async () => {
    const rows = await db.query<{ def: string }>(
      `SELECT indexdef AS def FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'webhook_deliveries'`,
    );
    expect(rows.some((r) => /UNIQUE INDEX .*\(provider, delivery_id\)/.test(r.def))).toBe(true);
  });

  it("chaque événement de WEBHOOK_EVENTS est accepté, un événement hors liste est refusé", async () => {
    for (const event of WEBHOOK_EVENTS) await insertDelivery(db, { event });

    expect(await sqlState(() => insertDelivery(db, { event: "ping" }))).toBe(BAD_ENUM);
  });

  it("payload doit être un objet jsonb (tableau et scalaire refusés)", async () => {
    expect(await sqlState(() => insertDelivery(db, { payload: "[]" }))).toBe(CHECK);
    expect(await sqlState(() => insertDelivery(db, { payload: "1" }))).toBe(CHECK);
    await insertDelivery(db, { payload: '{"zen":"ok"}' });
  });

  it("status hors énumération refusé", async () => {
    expect(await sqlState(() => insertDelivery(db, { status: "lost" }))).toBe(BAD_ENUM);
  });

  it("une livraison s'insère sans organisation ni installation préalable (H9)", async () => {
    await db.query(
      `INSERT INTO webhook_deliveries (id, provider, delivery_id, event, installation_external_id,
         payload, status, attempts, received_at, created_at, updated_at)
       VALUES ($1, 'github', $2, 'installation', '999', '{}'::jsonb, 'received', 0, now(), now(), now())`,
      [randomUUID(), randomUUID()],
    );
  });
});
