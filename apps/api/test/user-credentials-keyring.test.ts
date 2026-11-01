import { randomBytes } from "node:crypto";
import { withOrganization } from "@koklo/db";
import type { TestDatabase } from "@koklo/db/testing";
import type { GitUserCredentials } from "@koklo/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createKeyRing } from "../src/crypto/key-ring.ts";
import { createTokenCipher, TokenDecryptionError } from "../src/crypto/token-cipher.ts";
import { DatabaseService } from "../src/database/database.module.ts";
import { PrismaUserCredentials } from "../src/repo/prisma-user-credentials.ts";
import { configFor, createSeededDatabase } from "./helpers/app.ts";
import { insertInstallation } from "./helpers/repos.ts";
import { createWorld, type World } from "./helpers/tickets.ts";

/**
 * TK-52a : `PrismaUserCredentials` (jetons utilisateur, ADR 0009) reste inchangé et fonctionne
 * avec le porte-clés : les jetons écrits en v1 restent lisibles après le passage à la v2, les
 * nouvelles écritures sont en v2.
 */
const TOKENS: GitUserCredentials = {
  token: "jeton-factice-acces-0123456789",
  expiresAt: "2026-10-31T20:00:00.000Z",
  refreshToken: "jeton-factice-refresh-0123456789",
  refreshExpiresAt: "2027-04-30T12:00:00.000Z",
};
const k1 = randomBytes(32);
const k2 = randomBytes(32);

let database: TestDatabase;
let service: DatabaseService;
let a: World;
let installation: Awaited<ReturnType<typeof insertInstallation>>;

beforeAll(async () => {
  database = await createSeededDatabase();
  a = await createWorld(database);
  installation = await insertInstallation(database, a.organizationId);
  service = new DatabaseService(
    configFor({ databaseUrl: database.url, appVersion: "dev", appEnv: "test" }),
  );
}, 180_000);

afterAll(async () => {
  await service?.onModuleDestroy();
  await database?.dispose();
}, 60_000);

const userId = () => a.actors.owner.userId;
const run = <T>(work: () => Promise<T>) => withOrganization(a.organizationId, work);
const versions = async () =>
  (
    await database.query<{ key_version: number }>(
      "SELECT key_version FROM provider_user_credentials",
    )
  ).map((row) => row.key_version);

describe("PrismaUserCredentials avec le porte-clés", () => {
  it("v1 écrit avant la rotation, lu après ; réécriture en v2", async () => {
    const before = new PrismaUserCredentials(service, createTokenCipher(k1, { keyVersion: 1 }));
    await run(() => before.save(userId(), installation.id, TOKENS));
    expect(await versions()).toEqual([1]);

    const after = new PrismaUserCredentials(
      service,
      createKeyRing({
        current: { version: 2, key: k2 },
        previous: [{ version: 1, key: k1 }],
      }),
    );
    expect(await run(() => after.find(userId(), installation.id))).toEqual(TOKENS);
    await run(() => after.save(userId(), installation.id, TOKENS));
    expect(await versions()).toEqual([2]);
    expect(await run(() => after.find(userId(), installation.id))).toEqual(TOKENS);
  });

  it("clé v1 retirée alors qu'une ligne reste en v1 : TokenDecryptionError (jamais undefined)", async () => {
    const stale = new PrismaUserCredentials(service, createTokenCipher(k1, { keyVersion: 1 }));
    await run(() => stale.save(userId(), installation.id, TOKENS));
    const lost = new PrismaUserCredentials(
      service,
      createKeyRing({ current: { version: 2, key: k2 }, previous: [] }),
    );
    await expect(run(() => lost.find(userId(), installation.id))).rejects.toBeInstanceOf(
      TokenDecryptionError,
    );
  });
});
