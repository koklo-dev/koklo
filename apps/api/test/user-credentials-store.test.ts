import { randomBytes } from "node:crypto";
import { inspect } from "node:util";
import { MissingOrganizationContextError, withOrganization } from "@koklo/db";
import type { TestDatabase } from "@koklo/db/testing";
import type { GitUserCredentials } from "@koklo/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTokenCipher, TokenDecryptionError } from "../src/crypto/token-cipher.ts";
import { DatabaseService } from "../src/database/database.module.ts";
import { PrismaUserCredentials } from "../src/repo/prisma-user-credentials.ts";
import { configFor, createSeededDatabase } from "./helpers/app.ts";
import { insertInstallation } from "./helpers/repos.ts";
import { createWorld, type World } from "./helpers/tickets.ts";

/**
 * TK-48a1 AC-48-02 (jeton chiffré en base, AAD = userId:installationId) et AC-48-04 (isolation
 * par organisation). `installationId` est l'UUID Koklo de `provider_installations`. Décision du
 * Red : un enregistrement altéré LÈVE `TokenDecryptionError` (jamais `undefined`, qui se
 * confondrait avec « pas de jeton » et masquerait la corruption).
 */
const ACCESS = "ghu_ACCESS-SECRET-0123456789abcdef";
const REFRESH = "ghr_REFRESH-SECRET-0123456789abcdef";
const FULL: GitUserCredentials = {
  token: ACCESS,
  expiresAt: "2026-10-31T20:00:00.000Z",
  refreshToken: REFRESH,
  refreshExpiresAt: "2027-04-30T12:00:00.000Z",
};

let database: TestDatabase;
let service: DatabaseService;
let store: PrismaUserCredentials;
let a: World;
let b: World;
let installA: Awaited<ReturnType<typeof insertInstallation>>;
let installA2: Awaited<ReturnType<typeof insertInstallation>>;
let installB: Awaited<ReturnType<typeof insertInstallation>>;
const key = randomBytes(32);

beforeAll(async () => {
  database = await createSeededDatabase();
  a = await createWorld(database);
  b = await createWorld(database);
  installA = await insertInstallation(database, a.organizationId);
  installA2 = await insertInstallation(database, a.organizationId);
  installB = await insertInstallation(database, b.organizationId);
  service = new DatabaseService({
    ...configFor({ databaseUrl: database.url, appVersion: "dev", appEnv: "test" }),
  });
  store = new PrismaUserCredentials(service, createTokenCipher(key));
}, 180_000);

afterAll(async () => {
  await service?.onModuleDestroy();
  await database?.dispose();
}, 60_000);

const userA = () => a.actors.owner.userId;
const asA = <T>(run: () => Promise<T>) => withOrganization(a.organizationId, run);
const asB = <T>(run: () => Promise<T>) => withOrganization(b.organizationId, run);
const rows = () =>
  database.query<Record<string, unknown>>(
    "SELECT * FROM provider_user_credentials ORDER BY created_at, id",
  );

describe("PrismaUserCredentials : aller-retour", () => {
  it("find d'un couple inconnu : undefined", async () => {
    expect(await asA(() => store.find(userA(), installA.id))).toBeUndefined();
  });

  it("save puis find rend les mêmes identifiants (avec rafraîchissement)", async () => {
    await asA(() => store.save(userA(), installA.id, FULL));
    expect(await asA(() => store.find(userA(), installA.id))).toEqual(FULL);
  });

  it("jeton sans rafraîchissement : champs omis au retour", async () => {
    const minimal = { token: "ghu_minimal", expiresAt: "2026-10-31T20:00:00.000Z" };
    await asA(() => store.save(userA(), installA2.id, minimal));
    const found = await asA(() => store.find(userA(), installA2.id));
    expect(found).toEqual(minimal);
    expect(found).not.toHaveProperty("refreshToken");
  });

  it("save deux fois sur le même couple : une seule ligne, dernier jeton gagnant", async () => {
    const next = { ...FULL, token: "ghu_rotated", refreshToken: "ghr_rotated" };
    const before = (await rows()).length;
    await asA(() => store.save(userA(), installA.id, next));
    expect((await rows()).length).toBe(before);
    expect(await asA(() => store.find(userA(), installA.id))).toEqual(next);
    await asA(() => store.save(userA(), installA.id, FULL));
  });
});

describe("PrismaUserCredentials : rien en clair en base (AC-48-02)", () => {
  it("aucune sous-chaîne du jeton ni du rafraîchissement dans la ligne ; key_version et nonce présents", async () => {
    const [row] = await database.query<Record<string, unknown>>(
      "SELECT * FROM provider_user_credentials WHERE user_id = $1 AND installation_id = $2",
      [userA(), installA.id],
    );
    expect(row).toBeDefined();
    const dump = JSON.stringify(row);
    const stored = row as { ciphertext: Buffer; nonce: Buffer; key_version: number };
    for (const secret of [ACCESS, REFRESH, "ACCESS-SECRET", "REFRESH-SECRET", "ghu_", "ghr_"]) {
      expect(dump, secret).not.toContain(secret);
      expect(stored.ciphertext.toString("hex"), secret).not.toContain(
        Buffer.from(secret).toString("hex"),
      );
    }
    expect(stored.key_version).toBe(1);
    expect(stored.nonce.length).toBe(12);
    expect(stored.ciphertext.length).toBeGreaterThan(16);
    expect(row?.organization_id).toBe(a.organizationId);
  });

  it("la ligne entière (toutes tables concernées) ne contient pas les secrets", async () => {
    const text = (
      await database.query<{ t: string }>(
        "SELECT row_to_json(c)::text AS t FROM provider_user_credentials c",
      )
    )
      .map((r) => r.t)
      .join("\n");
    expect(text).not.toContain("SECRET");
  });
});

describe("PrismaUserCredentials : liaison utilisateur + installation (AAD)", () => {
  it("un chiffré recopié sur une autre installation du même utilisateur ne se déchiffre pas", async () => {
    await asA(() => store.save(userA(), installA.id, FULL));
    await database.query(
      `UPDATE provider_user_credentials d SET ciphertext = s.ciphertext, nonce = s.nonce
       FROM provider_user_credentials s
       WHERE s.user_id = $1 AND s.installation_id = $2 AND d.user_id = $1 AND d.installation_id = $3`,
      [userA(), installA.id, installA2.id],
    );
    const error = await asA(() => store.find(userA(), installA2.id)).catch((e: unknown) => e);
    expect(typeof TokenDecryptionError).toBe("function");
    expect(error).toBeInstanceOf(TokenDecryptionError);
  });

  it("un octet du chiffré altéré en base : TokenDecryptionError, sans fuite du jeton", async () => {
    await asA(() => store.save(userA(), installA.id, FULL));
    await database.query(
      `UPDATE provider_user_credentials SET ciphertext = set_byte(ciphertext, 0, get_byte(ciphertext, 0) # 1)
       WHERE user_id = $1 AND installation_id = $2`,
      [userA(), installA.id],
    );
    const error = (await asA(() => store.find(userA(), installA.id)).catch(
      (e: unknown) => e,
    )) as Error;
    expect(error).toBeInstanceOf(TokenDecryptionError);
    const seen = `${error.message}${JSON.stringify(error)}${inspect(error, { depth: 6 })}`;
    expect(seen).not.toContain(ACCESS);
    expect(seen).not.toContain(REFRESH);
    await asA(() => store.save(userA(), installA.id, FULL));
  });

  it("un clair authentique mais de forme inattendue : TokenDecryptionError, sans citer le clair", async () => {
    const odd = "not-json-ghu_LEAK-0123456789";
    const sealed = createTokenCipher(key).encrypt(odd, `${userA()}:${installA.id}`);
    await asA(() => store.save(userA(), installA.id, FULL));
    await database.query(
      "UPDATE provider_user_credentials SET ciphertext = $3, nonce = $4 WHERE user_id = $1 AND installation_id = $2",
      [userA(), installA.id, sealed.ciphertext, sealed.nonce],
    );
    const error = (await asA(() => store.find(userA(), installA.id)).catch(
      (e: unknown) => e,
    )) as Error;
    expect(error).toBeInstanceOf(TokenDecryptionError);
    expect(`${error.message}${inspect(error, { depth: 6 })}`).not.toContain("LEAK");
    await asA(() => store.save(userA(), installA.id, FULL));
  });

  it("une autre clé de chiffrement ne lit pas les jetons existants", async () => {
    const stranger = new PrismaUserCredentials(service, createTokenCipher(randomBytes(32)));
    const error = await asA(() => stranger.find(userA(), installA.id)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TokenDecryptionError);
  });
});

describe("PrismaUserCredentials : isolation par organisation (AC-48-04)", () => {
  it("l'organisation B ne lit pas le jeton de l'organisation A", async () => {
    await asA(() => store.save(userA(), installA.id, FULL));
    expect(await asB(() => store.find(userA(), installA.id))).toBeUndefined();
  });

  it("l'organisation B ne peut pas écrire sur l'installation de A : rien n'est créé ni modifié", async () => {
    const before = JSON.stringify(await rows());
    await expect(
      asB(() => store.save(userA(), installA.id, { ...FULL, token: "ghu_intruder" })),
    ).rejects.toThrow();
    expect(JSON.stringify(await rows())).toBe(before);
    expect(await asA(() => store.find(userA(), installA.id))).toEqual(FULL);
  });

  it("un jeton enregistré pour B est invisible de A et porte l'organisation de B", async () => {
    const userB = b.actors.owner.userId;
    await asB(() => store.save(userB, installB.id, FULL));
    expect(await asA(() => store.find(userB, installB.id))).toBeUndefined();
    const [row] = await database.query<{ organization_id: string }>(
      "SELECT organization_id FROM provider_user_credentials WHERE installation_id = $1",
      [installB.id],
    );
    expect(row?.organization_id).toBe(b.organizationId);
  });

  it("sans contexte d'organisation : refus", async () => {
    await expect(store.find(userA(), installA.id)).rejects.toBeInstanceOf(
      MissingOrganizationContextError,
    );
    await expect(store.save(userA(), installA.id, FULL)).rejects.toBeInstanceOf(
      MissingOrganizationContextError,
    );
  });
});

describe("PrismaUserCredentials : suppression en cascade", () => {
  it("supprimer l'installation supprime ses jetons", async () => {
    await asA(() => store.save(userA(), installA2.id, FULL));
    await database.query("DELETE FROM provider_installations WHERE id = $1", [installA2.id]);
    const left = await database.query(
      "SELECT 1 FROM provider_user_credentials WHERE installation_id = $1",
      [installA2.id],
    );
    expect(left).toHaveLength(0);
  });

  it("supprimer l'organisation supprime ses jetons", async () => {
    await database.query("DELETE FROM organizations WHERE id = $1", [b.organizationId]);
    const left = await database.query(
      "SELECT 1 FROM provider_user_credentials WHERE organization_id = $1",
      [b.organizationId],
    );
    expect(left).toHaveLength(0);
  });
});
